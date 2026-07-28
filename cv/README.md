# CV — Huzaifa Ziauddin

A print-ready, single-page A4 CV.

| File | What it is |
| --- | --- |
| `index.html` | The source. Self-contained — fonts, portrait, and styles are all inlined, so it renders identically offline and needs no network access. |
| `Huzaifa_Ziauddin_CV.pdf` | The rendered A4 PDF, for sending to employers and clients. |

## Regenerating the PDF

Open `index.html` in a browser and print to PDF with **A4** paper, **default (100%) scale**,
margins **None**, and **background graphics on**. The page sets `@page { size: A4; margin: 0 }`,
so the printed result matches the screen exactly.

From the command line with headless Chrome:

```sh
chrome --headless --print-to-pdf=Huzaifa_Ziauddin_CV.pdf --no-pdf-header-footer cv/index.html
```

## Editing

Content lives in plain semantic HTML at the bottom of the file. All visual values come from
CSS custom properties in the `:root` block at the top, so changing the accent colour or the
spacing scale in one place updates the whole document.

Layout is set in millimetres against a 297 mm A4 page. Current content height is ~294.5 mm,
so there is roughly 2.5 mm of headroom — after adding a bullet or a certification, reprint and
confirm the PDF is still one page.
