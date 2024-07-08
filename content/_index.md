---
# Leave the homepage title empty to use the site title
title: ""
date: 2024-07-07
type: landing

design:
  # Default section spacing
  spacing: "6rem"

sections:
  - block: resume-biography-3
    content:
      # Choose a user profile to display (a folder name within `content/authors/`)
      username: admin
      text: ""
      # Show a call-to-action button under your biography? (optional)
      button:
        text: CV
        url: uploads/resume.pdf
    design:
      css_class: dark
      background:
        color: black
        image:
          # Add your image background to `assets/media/`.
          filename: stacked-peaks.svg
          filters:
            brightness: 1.0
          size: cover
          position: center
          parallax: false
  - block: markdown
    content:
      title: '📚 More about me 📚'
      subtitle: ''
      text: |-
        I'm a theoretical astrophysicist that likes to think about problems in the framework of stochastic, fluctuating fluids and plasmas, e.g., turbulence, the phenomena that glues the different scales of the Universe together and one of the so-called <a href="https://mathoverflow.net/questions/27805/is-there-a-mathematically-precise-definition-of-turbulence-for-solutions-of-navie">oustanding problems in classical mechanics</a> (even though quantum mechanical turbulence is a well-established field of research). A lot of my published work pertains to the interstellar medium turbulence, and still now a significant portion of my time I dedicate to better understanding the [galactic turbulence cascade](https://ui.adsabs.harvard.edu/abs/1995ApJ...443..209A/abstract) through fundamental plasma physics, but an even larger portion of my time is dedicated to expanding across the Universe, from the meter scales of the plasma environment between two merging neutron stars, to the kpc scales of the intracluster medium. I work with a number of students and collaborators on theory and local numerical fluid plasma simulations, and I am keenly trying to engage with more collaborators on global and particle-in-cell simulations (please reach out!)! I very much enjoy working on the turbulent dynamo problems, and recently ran the [largest turbulent dynamo simulation in the world](https://arxiv.org/abs/2405.16626), reaching Reynolds number of over a million (grids of 10,080^3). I am always look for a new context to apply my understanding of turbulence and dynamos, even in quite abstract ways where the fluctuating field of interest is actually just clouds interfering with [ground-based optical communication networks](https://arxiv.org/abs/2211.09248), or the illumination of [Van Gogh's Starry Night](https://arxiv.org/abs/1902.03381). I like to work in teams, big or small, where ideas can be exchanged freely and problems can be explored in detail through multiple contributions of ideas and calculations. 
        
    design:
      columns: '1'
  - block: collection
    id: featured
    content:
      title: Featured Science
      filters:
        folders:
          - publication
        featured_only: true
    design:
      view: article-grid
      columns: 2
  - block: collection
    id: news
    content:
      title: Recent News
      subtitle: ''
      text: ''
      # Page type to display. E.g. post, talk, publication...
      page_type: post
      # Choose how many pages you would like to display (0 = all pages)
      count: 5
      # Filter on criteria
      filters:
        author: ""
        category: ""
        tag: ""
        exclude_featured: false
        exclude_future: false
        exclude_past: false
        publication_type: ""
      # Choose how many pages you would like to offset by
      offset: 0
      # Page order: descending (desc) or ascending (asc) date.
      order: desc
    design:
      # Choose a layout view
      view: date-title-summary
      # Reduce spacing
      spacing:
        padding: [-10.0, 0, 0, 0]

  - block: markdown
    id: collabs
    content:
      title: 'Frequent and current collaborators '
      subtitle: ''
      text: |-
      
        - Amitava Bhattacharjee (Princeton)
        - Christoph Federrath (Australian National University)
        - Neco Kriel (Australian National University)
        - Anne Noer Kolborg (University of California, Santa Cruz)
        - Bart Ripperda (CITA)
        - Elias Most (Caltech)
        - Sasha Philippov (University of Maryland)
        - Shashvat Varma (Univeristy of Toronto)
        - Matt Sampson (Princeton)
        - Romain Teyssier (Princeton)
        - Mark Krumholz (Australian National University)
        - Ralf Klessen (Heidelberg University)
        - Salvatore Cielo (Leibniz Supercomputing Centre)
        - Justin Kin Jun Hew (Australian National University)
        - Michael Grehan (University of Toronto)
        - Tanisha Ghosal (University of Toronto)
        - Philip Mocz (CCA, Flatiron)
        - Raphael Skalidis (Caltech)
        
    design:
      columns: '1'

---
