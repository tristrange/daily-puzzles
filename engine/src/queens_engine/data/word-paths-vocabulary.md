# Word Paths vocabulary provenance

Version1 is the original 748-word authored answer/acceptance pool. It remains
unchanged and supplies familiar generated answers for version2.

Version2 acceptance derives from the official released [SCOWL 2020.12.07](https://downloads.sourceforge.net/wordlist/scowl-2020.12.07.tar.gz).
Archive SHA256: `5587667caa20c4891390c2d42dbb4d5c4c3f41bee77af1457ece3ba23fb859cc`.
Select `final/<category>-words.<size>` for categories english, american, british,
british_z, variant_1, british_variant_1, and levels10,20,35,40,50,55,60.
Read Latin1, retain lines matching `[a-z]{3,6}`, uppercase, deduplicate and sort.
Union with the v1 pool (currently adds no words). This yields16,781 entries with
semantic SHA256 `b5ffd19f0acf8e99fe2d2160ec86329e72bf6eeb6fe75f3786f013fc47da689a`
(join normalized sorted words with newline, without a trailing newline).

This includes ordinary inflections and British/American spellings. It is a finite
word-game dictionary, not every English word. Answer selection remains narrower.
All redistribution notices are retained in `app/public/word-paths-vocabulary-notice.txt`,
which ships with the site. Future changes require a new version, preserving replay.
