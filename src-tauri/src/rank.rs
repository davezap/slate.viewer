//! Best matches (Search > Best matches): the notes that best match a query's words, best
//! first, each with its best lines. Words may come in any order and match the start of a word
//! in any case ("refund" finds "Refunds"). Scored like Metatrash's `search` with `rank` (Core
//! 0.97.0): each word weighed by how rare it is among the notes (BM25's idf), its uses counted
//! with diminishing returns, a bonus when it is in the note's name (more) or folder, and more
//! for notes holding more of the words.

/// Most query words used.
pub const MAX_WORDS: usize = 10;
/// Best lines kept per note.
pub const LINES_PER_FILE: usize = 3;

pub struct RankedFile {
    pub path: String,
    /// One-based line numbers with their text, in file order.
    pub lines: Vec<(usize, String)>,
}

/// Lower-case runs of letters and digits.
pub fn tokens(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut word = String::new();
    for c in text.chars() {
        if c.is_alphanumeric() {
            word.extend(c.to_lowercase());
        } else if !word.is_empty() {
            out.push(std::mem::take(&mut word));
        }
    }
    if !word.is_empty() {
        out.push(word);
    }
    out
}

/// The query's words, each once, at most MAX_WORDS.
pub fn query_words(query: &str) -> Vec<String> {
    let mut words: Vec<String> = Vec::new();
    for w in tokens(query) {
        if !words.contains(&w) && words.len() < MAX_WORDS {
            words.push(w);
        }
    }
    words
}

fn has_prefix(tokens: &[String], word: &str) -> bool {
    tokens.iter().any(|t| t.starts_with(word))
}

/// Ranks `files` (relative path with `/`, text) for `words`; returns at most `limit` notes and
/// whether more matched.
pub fn rank(files: &[(String, String)], words: &[String], limit: usize) -> (Vec<RankedFile>, bool) {
    if words.is_empty() {
        return (Vec::new(), false);
    }
    struct Seen { index: usize, tf: Vec<usize>, name: Vec<bool>, folder: Vec<bool> }
    let total = files.len() as f64;
    let mut df = vec![0usize; words.len()];
    let mut seen = Vec::new();
    for (index, (path, text)) in files.iter().enumerate() {
        let (folder, name) = match path.rfind('/') {
            Some(i) => (&path[..i], &path[i + 1..]),
            None => ("", path.as_str()),
        };
        let name_tokens = tokens(name);
        let folder_tokens = tokens(folder);
        let mut tf = vec![0usize; words.len()];
        for t in tokens(text) {
            for (i, w) in words.iter().enumerate() {
                if t.starts_with(w.as_str()) {
                    tf[i] += 1;
                }
            }
        }
        let name: Vec<bool> = words.iter().map(|w| has_prefix(&name_tokens, w)).collect();
        let folder: Vec<bool> = words.iter().map(|w| has_prefix(&folder_tokens, w)).collect();
        let mut any = false;
        for i in 0..words.len() {
            if tf[i] > 0 || name[i] || folder[i] {
                df[i] += 1;
                any = true;
            }
        }
        if any {
            seen.push(Seen { index, tf, name, folder });
        }
    }
    let mut scored: Vec<(f64, &Seen)> = seen
        .iter()
        .map(|s| {
            let (mut score, mut held) = (0.0, 0usize);
            for i in 0..words.len() {
                let d = df[i] as f64;
                let idf = (1.0 + (total - d + 0.5) / (d + 0.5)).ln();
                let mut w = 0.0;
                if s.tf[i] > 0 {
                    let tf = s.tf[i] as f64;
                    w += tf / (tf + 1.2);
                }
                if s.name[i] {
                    w += 1.5;
                } else if s.folder[i] {
                    w += 0.5;
                }
                if w > 0.0 {
                    held += 1;
                }
                score += idf * w;
            }
            (score * (0.5 + 0.5 * held as f64 / words.len() as f64), s)
        })
        .collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0).then_with(|| files[a.1.index].0.cmp(&files[b.1.index].0)));
    let truncated = scored.len() > limit;
    scored.truncate(limit);
    let out = scored
        .into_iter()
        .map(|(_, s)| {
            let (path, text) = &files[s.index];
            RankedFile { path: path.clone(), lines: best_lines(text, words) }
        })
        .collect();
    (out, truncated)
}

/// The lines holding the most of the words (the first of equals), at most LINES_PER_FILE, in
/// file order.
pub fn best_lines(text: &str, words: &[String]) -> Vec<(usize, String)> {
    let mut found: Vec<(usize, usize, &str)> = Vec::new();
    for (i, line) in text.lines().enumerate() {
        let low = line.to_lowercase();
        if !words.iter().any(|w| low.contains(w.as_str())) {
            continue;
        }
        let toks = tokens(line);
        let n = words.iter().filter(|w| has_prefix(&toks, w)).count();
        if n > 0 {
            found.push((i, n, line));
        }
    }
    found.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    found.truncate(LINES_PER_FILE);
    found.sort_by_key(|f| f.0);
    found.into_iter().map(|(i, _, line)| (i + 1, line.to_string())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files() -> Vec<(String, String)> {
        vec![
            ("guides/refunds.md".into(), "# Refunds\nHow to ask for a refund.\nRefunds take five days.\n".into()),
            ("guides/billing.md".into(), "# Billing\nPlans, invoices and refunds.\nPaddle sends the invoice.\n".into()),
            ("notes/misc.md".into(), "Nothing about money here.\n".into()),
            ("refund-policy/terms.md".into(), "Terms of sale.\n".into()),
        ]
    }

    #[test]
    fn ranks_by_words_name_and_folder() {
        let (got, more) = rank(&files(), &query_words("Refund"), 10);
        let paths: Vec<&str> = got.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths[0], "guides/refunds.md");
        assert!(paths.contains(&"refund-policy/terms.md") && paths.contains(&"guides/billing.md"));
        assert!(!paths.contains(&"notes/misc.md") && !more);
        assert_eq!(got[0].lines[0].0, 1);
        let (got, more) = rank(&files(), &query_words("paddle invoice"), 1);
        assert_eq!(got[0].path, "guides/billing.md");
        assert!(!more);
        let (got, more) = rank(&files(), &query_words("refund"), 1);
        assert_eq!(got.len(), 1);
        assert!(more);
        assert!(rank(&files(), &query_words("-> =="), 10).0.is_empty());
    }

    #[test]
    fn best_lines_prefer_more_words() {
        let text = "one apple\ntwo\napple pear\npear\nan apple a pear a plum\nlast apple\n";
        let got = best_lines(text, &query_words("apple pear plum"));
        assert_eq!(got.iter().map(|l| l.0).collect::<Vec<_>>(), [1, 3, 5]);
    }

    #[test]
    fn words_are_unicode_and_lower_case() {
        assert_eq!(query_words("Café, café NAÏVE x-y"), ["café", "naïve", "x", "y"]);
    }
}
