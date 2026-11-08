# Third-party notices

This project is original, hand-written code. It does not vendor any third-party
source code. Two kinds of third-party assets/design ideas are used and are
credited below: self-hosted font files, and a design language ported (as
tokens/layout patterns only, never code) from an MIT-licensed open-source
project.

## Fonts

### Inter

- License: SIL Open Font License, Version 1.1 (OFL-1.1).
- Files: `src/assets/fonts/inter-latin-400.woff2`,
  `src/assets/fonts/inter-latin-ext-400.woff2`,
  `src/assets/fonts/inter-latin-600.woff2`,
  `src/assets/fonts/inter-latin-ext-600.woff2`.
- Full license text: `src/assets/fonts/OFL.txt`.
- Source: https://github.com/rsms/inter

### JetBrains Mono

- License: SIL Open Font License, Version 1.1 (OFL-1.1).
- Files: `src/assets/fonts/jetbrains-mono-latin-400.woff2`,
  `src/assets/fonts/jetbrains-mono-latin-ext-400.woff2`.
- Full license text: `src/assets/fonts/JetBrainsMono-OFL.txt`.
- Source: https://github.com/JetBrains/JetBrainsMono
- Note: these two files are subset with fonttools/pyftsubset from a genuine,
  unmodified JetBrains Mono Regular (v2.304) TrueType font, down to the exact
  `unicode-range`s declared in `src/styles/tokens.css` (~14.6 KB latin /
  ~11.3 KB latin-ext as WOFF2).

## Design language: AstroPaper

- Project: AstroPaper (https://github.com/satnaing/astro-paper)
- License: MIT
- What was ported: only the overall visual design language -- the design
  token structure/naming conventions (background/foreground/muted/border/
  accent colours, light and dark sets), and general page-layout and
  component visual patterns (card/chip/button styling, heading scale,
  reading measure, header/footer shape). No source code, build tooling, or
  configuration from that project was copied, imported, or adapted; this
  project's components, styles and tests are all written from scratch in
  plain CSS (see `CLAUDE.md`: no Tailwind).

```
MIT License

Copyright (c) AstroPaper contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
