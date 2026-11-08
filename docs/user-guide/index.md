# User guide

This guide is for Andrius: how to update the content of riauba.org without touching any code.
Everything on the site today comes from two places in the repository:

- `content/cv.yaml` — your CV: name, role, summary, work history, skills, education, languages
  and profile links.
- `content/projects/*.md` — one file per project shown on the home page.

!!! note "What's live today"
    Right now the site has a home page and a styled 404 page. The CV page, the project detail
    pages and the "How this site was built" page are planned but not built yet — the menu
    already links to them, so clicking those links currently shows the 404 page below. This
    guide only covers what you can edit today: the home page content.

## How to update the home page content

The home page (screenshots below) shows your name, role, a one-line summary, your remote-work
preference, your profile links, and your featured projects.

![Home page, light mode](img/home-light.png)

![Home page, dark mode](img/home-dark.png)

To change what it shows:

1. Open `content/cv.yaml` in a text editor.
2. Edit the fields under `basics:`:
   - `name` — your displayed name.
   - `label` — the short role line shown under your name (e.g. "Senior Java Developer · AI
     Engineer").
   - `summary` — the paragraph shown on the home page. It's written as a YAML "folded" block
     (the `>` after `summary:`), so you can wrap it across multiple indented lines in the file
     and it will still render as one paragraph.
   - `remote` — the one-line sentence about what kind of role/remote setup you're open to.
   - `email` — used to build the "email me" link in the footer.
3. Save the file and rebuild the site (`make build`) to see your changes, or run `make e2e` to
   also check nothing broke.

There is no need to touch any `.astro` file to change this text — the home page always reads
it fresh from `content/cv.yaml` at build time.

### How profile links work (the TODO rule)

Under `basics.profiles:` you list your social/professional links, for example:

```yaml
profiles:
  - { network: "LinkedIn", url: "https://www.linkedin.com/in/andrius-r" }
  - { network: "GitHub", url: "https://github.com/asas1313" }
```

Any profile is shown as a link on the home page and (for LinkedIn specifically) in the footer
— **unless** its `network` or `url` value is the literal placeholder text `"TODO"`. That entry
is then automatically hidden from the published site, so it's safe to leave a placeholder row
in `content/cv.yaml` for a profile you haven't set up yet (e.g. a future "Mastodon" or "X"
link) without it appearing broken on the live site. This check ignores extra spaces and
capitalisation, so `"todo"` or `" TODO "` are hidden too — but any other text, even a typo, is
treated as a real value and published as-is. Double-check the exact URL before you save.

To publish a link, just replace `"TODO"` with the real URL (and make sure `network` has the
real platform name) and rebuild.

### What happens if you make a typo in cv.yaml

`content/cv.yaml` has a strict structure. If you remove a required field (for example delete
the `name:` line entirely) or put the wrong kind of value in a field, the site will refuse to
build: `make build` fails with an error message listing exactly which field is wrong and why,
instead of silently publishing a broken page. Fix the field mentioned in the error and build
again.

## How to add a new project

Featured projects appear on the home page, each linking to a project page (not built yet — see
the note at the top of this guide). To add a new project:

1. Create a new file in `content/projects/`, named after the project using lowercase letters
   and hyphens, e.g. `content/projects/my-new-project.md`. This filename becomes the project's
   URL slug.
2. Give it frontmatter like this (copy an existing file in that folder as a starting point,
   e.g. `content/projects/atsidek.md`):

   ```markdown
   ---
   title: "My New Project"
   tagline: "One short sentence describing it"
   status: "live"
   order: 5
   featured: true
   links: { live: "https://example.com", docs: null, repo: null }
   stack: ["Java", "Spring Boot"]
   ---
   A short description of the project goes here, in normal markdown.
   ```

   Field notes:
   - `title` — the project name shown on the home page.
   - `tagline` — the one-line description shown under the title.
   - `status` — a free-text status word; the existing projects use `"live"`, `"active"` and
     `"case-study"`, but any short word works.
   - `order` — a number controlling where it appears among featured projects (lower numbers
     first).
   - `featured` — set to `true` to show it on the home page, `false` to keep it in the repo
     without publishing it there yet.
   - `links` — set `live`, `docs` and/or `repo` to a URL, or leave as `null` if there isn't one
     yet.
   - `stack` — a list of technology names shown as tags.
3. Save the file and rebuild (`make build`). No code changes are needed — any `.md` file in
   `content/projects/` with valid frontmatter is picked up automatically.

If the frontmatter is missing a required field or has the wrong type (e.g. `order` written as
text instead of a number), the build fails with a clear error naming the problem, the same way
it does for `cv.yaml`.

## The 404 page

If you (or a visitor) follow a broken or not-yet-built link, the site shows a styled "page not
found" message with a link back to the home page, instead of a blank browser error:

![404 page](img/404-page.png)

This is what you'll currently see for the Projects, CV and "How this site was built" menu
links, since those pages haven't been built yet.
