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
        I'm a theoretical astrophysicist that likes to think about problems in the framework of stochastic, fluctuating fluids and plasmas, e.g., turbulence, the phenomena that glues the different scales of the Universe together and one of the so-called <a href="https://mathoverflow.net/questions/27805/is-there-a-mathematically-precise-definition-of-turbulence-for-solutions-of-navie">oustanding problems in classical mechanics</a> (even though quantum mechanical turbulence is a well-established field of research). A lot of my published work pertains to the interstellar medium turbulence, and still now a significant portion of my time I dedicate to better understanding the <a href="https://ui.adsabs.harvard.edu/abs/1995ApJ...443..209A/abstract">galactic turbulence cascade</a> through fundamental plasma physics, but an even larger portion of my time is dedicated to expanding across the Universe, from the meter scales of the plasma environment between two merging neutron stars, to the kpc scales of the intracluster medium. I work with a number of students and collaborators on theory and local numerical fluid plasma simulations, and I am keenly trying to engage with more collaborators on global and particle-in-cell simulations (please reach out!)! I very much enjoy working on the turbulent dynamo problems, and recently ran the <a href="https://arxiv.org/abs/2405.16626">largest turbulent dynamo simulation in the world</a>, reaching Reynolds number of over a million (grids of 10,080^3). I am always looking for a new context to apply my understanding of turbulence and dynamos, even in quite abstract ways where the fluctuating field of interest is actually just clouds interfering with <a href="https://arxiv.org/abs/2211.09248">ground-based optical communication networks</a>, or the illumination of  <a href="https://arxiv.org/abs/1902.03381">Van Gogh's Starry Night</a>. I like to work in teams, big or small, where ideas can be exchanged freely and problems can be explored in detail through multiple contributions of ideas and calculations. 
        
    design:
      columns: '1'
      spacing:
        padding: [0, 0, 0, 0]
  - block: collection
    id: featured
    content:
      title: Featured Science Highlights
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
        padding: [0, 0, 0, 0]

  - block: markdown
    id: collabs
    content:
      title: 'Frequent and current collaborators '
      subtitle: ''
      text: |-
        In order of roughly who I slack or email the most.
      
        - <a href="https://amitava.scholar.princeton.edu">Amitava Bhattacharjee</a> (Princeton)
        - <a href="https://www.mso.anu.edu.au/~chfeder/">Christoph Federrath</a>  (Australian National University)
        - <a href="https://astrokriel.github.io">Neco Kriel</a>  (Australian National University)
        - <a href="https://www.astro.ucsc.edu/about/staff-directory-page.php?uid=akolborg">Anne Noer Kolborg</a>  (University of California, Santa Cruz)
        - <a href="https://klessen.org">Ralf Klessen</a>  (Heidelberg University)
        - <a href="https://bartripperda.com">Bart Ripperda</a>  (CITA)
        - <a href="https://comp-relastro.caltech.edu">Elias Most</a>  (Caltech)
        - <a href="https://umdphysics.umd.edu/people/faculty/current/item/1893-sashaph.html">Sasha Philippov</a>  (University of Maryland)
        - Shashvat Varma (Univeristy of Toronto)
        - <a href="https://fr.linkedin.com/in/louis-burnaz-569b7a254">Louis Burnaz</a> (École normale supérieure de Lyon)
        - <a href="https://inspirehep.net/authors/1947312"> Michael Grehan</a> (University of Toronto)
        - <a href=" https://orcid.org/0009-0009-4853-4670">Tanisha Ghosal</a> (University of Toronto)
        - <a href="https://msampson.net">Matt Sampson</a>  (Princeton)
        - <a href="https://www.astro.princeton.edu/~rt3504/">Romain Teyssier</a>  (Princeton)
        - <a href="https://www.mso.anu.edu.au/~krumholz/">Mark Krumholz</a>  (Australian National University)
        - <a href="https://www.researchgate.net/profile/Salvo-Cielo">Salvatore Cielo</a> (Leibniz Supercomputing Centre)        
        - <a href="https://rsaa.anu.edu.au/people/justinkinjun-hew">Justin Kin Jun Hew</a>  (Australian National University)
        - <a href="https://pmocz.github.io">Philip Mocz</a>  (CCA, Flatiron)
        - <a href="https://www.researchgate.net/profile/Raphael-Skalidis">Raphael Skalidis</a>  (Caltech)  
    design:
      columns: '2'

---
