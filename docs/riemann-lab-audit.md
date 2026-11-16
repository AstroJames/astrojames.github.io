# Finite-volume lab audit

2026-11-15. Scope: all offered scalar-advection and ideal-gas Euler examples,
reconstructions, time integrators, worker scheduling, and walkthrough data.
The full-time preset sweep covers grids through 512 cells. The newer 1,024,
2,048 and 4,096-cell grids have short-run checks described below.

## First-order flux correction

An optional gas-only FOFC switch now applies to both solves and preserves live
state/time. Defaults remain off. This follows the inspected local AthenaK
AthenaK checkout (HEAD `da852028`,
working-tree sources inspected):

- `src/hydro/hydro_fofc.cpp`: form the actual stage trial, test whether primitive
  recovery needs floors, replace both faces of each flagged cell using stored
  primitive states and first-order LLF.
- `src/hydro/rsolvers/llf_hyd_singlestate.hpp`: half the sum of physical fluxes
  minus half the maximum endpoint acoustic speed times the conserved jump.
- `src/eos/ideal_hyd.cpp`: test-only conversion sets flags without replacing
  the actual conserved data.
- `src/mhd/mhd_fofc.cpp`: optional iterative rechecking and mask growth. This
  lab has no magnetic field, constrained transport, MPI, or excision.

Inspected SHA256: hydro FOFC
`fd87ce6c045673c5502fe6cb9a6fc4bb8c5e422864d98a29db06e776f9ac10b9`;
MHD FOFC `d2fc60e3f612f91f10d1cd95ea3e60130223382fe5e981dad7127e34053a5c50`.
The [official hydro documentation](https://ias-astrophysics.github.io/athenak-docs/hydro.html)
also documents the optional positivity fallback and configurable EOS floors.
No AthenaK source was changed.

The browser implementation is a conservative adaptation, not a literal port:

1. Check density and pressure strictly above zero and all conserved components
   finite. AthenaK instead tests its configured density, energy and temperature
   floors. This lab does not inject floors or clip conserved averages.
2. Before HLLE, a separate face guard replaces any flux with nonphysical
   reconstructed inputs by LLF using the two donor-cell states. The attempted
   reconstruction remains visible; step 3 shows the actual inputs.
3. Predict every actual Butcher stage and final update. A failed cell marks both
   shared faces in **every contributing flux evaluation**, and the entire RK
   trial is replayed from its original state. This explicitly generalizes the
   stage-local AthenaK update to the four tableaus offered here, including RK4.
   Downstream states and fluxes are recomputed, not patched with stale values.
4. Masks only grow during an attempt. Up to eight passes are allowed; failure
   then uses the existing common time-step halving, at most twelve attempts.
   No RK4 SSP or unconditional positivity guarantee is claimed.
5. Corrected fluxes supply both neighboring updates and the RK-weighted external
   boundary budget. Periodic endpoint aliases share a correction and count as
   one face. Scalar advection bypasses FOFC entirely; ringing is not a trigger.

`trialStep` is side-effect-free and shared by the solver and FOFC walkthrough,
including the smaller common step if either comparison needs a retry. Preview
work and rejected attempts do not increment accepted-step counters. Counters
measure face-stage replacements, not unique cells; markers show the union of
faces corrected in the last accepted step. Step 3 explicitly shows the **next
first substep**, whose mask can differ. Live toggles preserve state and budgets;
a toggle after a latched fault restarts explicitly. Copying the main solution
also copies its correction history/count, and restart clears it.

Seven new regression tests verify the independent LLF formula/reflection,
bitwise inactive behavior for smooth gas and scalar methods, deliberately bad
trial states under all RK choices, both-face correction/rechecking, all-component
conservation, periodic endpoints, common retries, preview/acceptance agreement,
counter semantics and live toggles. The full suite passes all 55 tests; the
run log is `output/riemann-audit/fofc-tests.txt`.

`scripts/audit-riemann-fofc.mjs` completes **204/204 cases**, all with positive
stored states. It covers all 12 gas reconstructions × two shock tubes × four RK
choices × grids 16/64, plus TENO5/6 with Forward Euler at 128/256/512 cells.
Thirteen cases activate correction. Maximum normalized mass/momentum/energy
budget residual is **1.8569e-14**. The formerly failing TENO6/Euler/Sod64 case
completes t=0.2 with 17 accepted face-stage replacements and no time-step retry;
TENO5/Euler/Sod64 uses 18. Data: `output/riemann-audit/fofc.json`.
The previous 720/264-case results below were obtained with FOFC **off**.

All 22 browser checks pass, with zero console errors or warnings. They cover
the preset, live toggles, actual LLF formula/inputs at
the known failure, strict LaTeX, accepted counters/markers, continuation beyond
the failure, off-mode stop and recovery, scalar disabling, and 320–1440px layouts.
Screenshot: `output/playwright/riemann-fofc-face.png`.

## Additional reconstructions

Added Unlimited 5, MP5, WENO-JS5, WENO-JS7, WENO-JS9, CWENO5, and TENO6.

- WENO-JS5/7/9 use three/four/five candidates of degree two/three/four,
  respectively, and five/seven/nine means. Weights are the Jiang–Shu inverse
  squared smoothness weights with epsilon=1e-6. Their optimal weights are
  (1,6,3)/10, (1,12,18,4)/35, and (1,20,60,40,5)/126.
- TENO6 is the original fixed-cutoff scheme, not TENO6-opt. Its oriented full
  stencil is [-2,-1,0,1,2,3]. Candidates are [-2,-1,0], [-1,0,1], [0,1,2],
  and [0,1,2,3], with weights (0.05,0.45,0.3,0.2). The fourth candidate is cubic.
  C=1, power=6, epsilon=1e-40, cutoff=1e-7. Tau6 is the absolute difference
  between the full six-cell polynomial’s JS indicator and
  (beta_left+4 beta_central+beta_right)/6. This matches Fu et al. §3.3,
  Eq. (18)–(19), and Tables 1/5, with the first three candidates reordered.
- CWENO5 uses a corrected central quartic and three quadratics. One polynomial
  supplies both faces and the donor-cell interior. Weights are
  (3/4,1/16,1/8,1/16), epsilon=Δx², power=2. The corrected quartic retains
  the donor mean but is not an interpolant of all five input means.
- MP5 follows Suresh–Huynh §2 and Appendix A, including alpha=4 and the
  1e-10 quick-test tolerance. Its common CFL is 0.2, including when MP5 is
  the hidden comparison. This does not turn classical RK4 into an SSP method.
  The plot distinguishes the unlimited polynomial from the limited face value.
- Unlimited 5 uses the actual five-mean quartic in the scalar solve. It is
  disabled for gas dynamics; switching examples replaces it with PCM.

`scripts/generate-reconstruction-tables.py` generates polynomial maps by exact
rational inversion of finite-volume moments. SymPy verifies every moment,
optimal face reproduction through the design degree, positive LDL factors for
JS derivative integrals, and all 21 coefficients of the published full-stencil
beta6 expression. Runtime indicators use sums of positive squares and polynomial
maps act on deviations from the donor mean. Constants are preserved exactly.
The mathematics CLI is unavailable, so these checks use SymPy.

The expanded regression checks complete all applicable methods on Gaussian,
square, Sod and Lax at 64/256 cells with SSPRK3, and all five examples at
16/32 cells. Additional tests independently check mirrored/ghost candidate
moments, both CWENO faces/interiors, smooth face orders 5/6/7/9, nonlinear
weights, MP5 limiting/CFL, scalar-only restrictions, and atomic TENO6 stops.

The separate full-time audit `scripts/audit-riemann-new-methods.mjs` runs all
seven additions at 16 and 64 cells with all four RK choices: **264 cases,
263 complete, one physical-state stop, no unexpected failures**. Maximum
normalized mass/momentum/energy residual is **5.461e-13**. The one stop is
TENO6/Forward Euler/Sod/64, at t=0.08561662638 after 38 steps, with a nonpositive
reconstructed face. The last stored state remains admissible and unchanged by
the failed step. All tested SSPRK2, SSPRK3 and RK4 cases complete. Results are
saved in `output/riemann-audit/new-methods.json`. This is not an all-grid audit.

Browser checks: 119 pass, with zero console errors/warnings. They cover every
new method, both faces and both source orientations, actual input/candidate
counts, live stepping, LaTeX, MP5 CFL, scalar-only option handling and layouts
at 320/390/760/1440px. TENO6, WENO9 mobile, and TENO6 equations were visually
reviewed in `output/playwright/riemann-{teno6-stencils,weno9-stencils,weno9-mobile,teno6-equations}.png`.

## Findings and changes

Playback previously limited each numerical step to the next browser-animation
target. This made the time step depend on playback speed and timer cadence.
The worker now accumulates a display-time budget and schedules complete CFL
steps. Interactive evolution has no fixed end time. Only explicit audit targets
and positivity retries shorten a step.
The same preset now produces bitwise-identical states after 100 steps at ½×, 1× and 4×
with irregular timer intervals. A 16-cell unit-speed solve continues through t=2.1875 after 100 full CFL steps.
Pause/resume and single stepping preserve this continuing trajectory. Periodic
advection keeps circulating. Shock tubes retain outflow boundaries; once the
first exact wave reaches a boundary, the UI hides the infinite-domain exact
reference, error and overshoot diagnostics. Conservation diagnostics continue.
Switching away from the tab still pauses playback.

The original preset sweep covers 5 examples × 6 reconstructions × 6 grids × 4 time
integrators = 720 configurations, each through its original finite audit horizon. Of these, **714 finish with physical gas states
and conservation residuals below 2.0e-14** (mass, momentum and energy, normalized
by max(1, the initial component integral)). Six combinations stop:

| Reconstruction / integration | Example | Cells |
| --- | --- | --- |
| TENO5 / Forward Euler | Sod | 64, 128, 256, 512 |
| TENO5 / Forward Euler | Lax | 256, 512 |

For example, Sod/64 stops at t=0.1246707333 with admissible stored conserved
states but a reconstructed face pressure of −0.0193911. Reducing the next time
step cannot change a reconstruction from its initial state. The solver now checks
face density and pressure before calling HLLE and identifies the offending face.
A bad reconstruction at an intermediate RK stage can still trigger a smaller
common step. With FOFC off, no clipping, floors, or alternate reconstruction are inserted.

The UI labels this observed limitation. A stopped solve keeps the last physical
solution, hides invalid/stale inspection diagrams, and cannot advance into NaNs.
Changing the reconstruction or RK method after a stop restarts from the initial
data and explains that restart. Ordinary live switches preserve state and time.
All 180 presets for each of SSPRK2, SSPRK3 and RK4 complete the sweep.

The failures are consistent with the stability limitation of Forward Euler, not
an expectation that all high-order reconstructions should be monotone. For the
smooth optimal-weight fifth-order scalar operator, the dimensionless Fourier
symbol is

\[
\lambda\Delta x/a=-\mathrm i\theta-\theta^6/60+
\mathrm i\theta^7/140+O(\theta^8).
\]

With Courant number ν, Forward Euler has
\(|G|^2=1+\nu^2\theta^2-\nu\theta^6/30+O(\theta^8)\), which exceeds one for
sufficiently small nonzero θ at fixed positive ν. This symbolic result explains
why a CFL bound alone does not ensure stability for this method combination.
It is not a proof of the cause of every nonlinear shock-tube failure.

## Verification

The 55 automated tests cover:

- Analytic scalar cell integrals, partly filled square-pulse cells and periodic
  displacement in both directions.
- Primitive/conserved conversion, ideal-gas flux consistency, HLLE supersonic
  branches, intermediate-state jump relations, and reflection.
- Flux-difference signs, periodic ghost values, telescoping conservation of all
  three Euler components, and RK-weighted external-boundary budgets.
- Both exact shock tubes: Rankine–Hugoniot relations, rarefaction entropy and
  Riemann invariants, and integrated conservation of the reference solution.
- All reconstruction means/edges, limiter envelopes, mirrored/ghost stencils,
  nonlinear weights, rejected candidates, complete three-cell polynomial
  moments, and the five-cell quartic moments.
- Fifth-order smooth scalar face convergence and independent semidiscrete
  Fourier-mode time convergence at orders 1–4. The Butcher tableaus also satisfy
  every rooted-tree order condition through their stated order.
- Live switches and worker revision handling, complete CFL playback steps,
  invalid-face rejection without stored-state mutation, and stopped-worker
  recovery.
- Strict LaTeX compilation with accessible MathML for all reconstruction forms.
- Four-step checks on each fine grid for all 24 scalar reconstruction/RK
  combinations, and WENO-Z/TENO5 with SSPRK3 on both Euler shock tubes.
  Finite/admissible states and all conserved-component boundary budgets pass.

The mathematics CLI is unavailable on this machine. SymPy checks the candidate
moments, Jiang–Shu derivative integrals, optimal degree-0–4 face values, all five
quartic moments, and the Fourier series above as exact algebraic identities.

Browser checks cover the guided keyboard-operable steps, both face/source
orientations, full-support candidate geometry, rejected-candidate highlighting,
live RK switches, comparison, overshoot, all LaTeX panels, numerical-stop
recovery, and layouts from 320 to 1440 px. Detailed equations scroll within their
own blocks without widening the page.

Fine-grid UI checks cover stepping at all three new sizes, overshoot inspection,
16-cell zoom, panning/click selection, return to full domain, and 390/1440px
layouts (13 checks, no browser console errors). The paused 16-cell square-pulse
TENO5/SSPRK3 demo has q_max=1.0643 at t=0.196875, cell 8 (x=0.53125).
In contrast, the 1,024-cell square-pulse TENO5/SSPRK3 run has no measurable
overshoot at sampled checkpoints through 3,000 steps (t=1.02539). Refinement
is not a guarantee of visible ringing. Inspection changes only the view.

## Reproduce

```sh
node --test test/riemann-lab.test.mjs test/riemann-lab-audit.test.mjs test/riemann-higher-order.test.mjs test/riemann-fofc.test.mjs
python test/riemann-reconstruction-symbolic.py  # requires SymPy
python scripts/generate-reconstruction-tables.py # regenerate and verify new kernels
node scripts/audit-riemann-new-methods.mjs      # 264 new-method cases (FOFC off)
node scripts/audit-riemann-fofc.mjs             # 204 gas cases (FOFC on)
node scripts/audit-riemann-lab.mjs             # 720 presets through 512 cells
node scripts/audit-riemann-lab.mjs --all-grids # optional expensive 1,080-preset sweep
```

The default sweep saves `output/riemann-audit/preset-sweep.json`.
The optional fine-grid full sweep has not been run. It reports completed
runs and the six known physical-state stops separately. Any additional failure
makes the sweep exit unsuccessfully.

## Mathematical scope

Order labels describe smooth scalar reconstruction. WENO/TENO accuracy applies
at the target face; their candidate curves have the degree dictated by their
stencils. CWENO5 defines a fifth-order polynomial throughout the donor cell.
The primitive-variable Euler extension and finite-order RK time integration do
not inherit the spatial face order automatically. The optional quartic overlay
is a reference; the separate Unlimited 5 method does use that quartic for
scalar evolution.

The walkthrough previews the next operator and first stage at the proposed CFL
time step. Positivity retries may reduce the accepted gas-dynamics step. Explicit
Forward Euler and classical RK4 are not asserted to preserve positivity or
monotonicity for every reconstruction. The exact Euler solver is exercised on
the offered Sod and Lax initial states, not arbitrary vacuum Riemann problems.

## Primary references

- [Clawpack: finite-volume conservation and Godunov methods](https://www.clawpack.org/riemann_book/html/Approximate_solvers.html), “Finite volume methods” and “Godunov’s method”.
- [Clawpack: Euler equations and Riemann structure](https://www.clawpack.org/riemann_book/html/Euler.html), conservation laws, characteristic velocities, invariants and shock relations.
- [Fu, Hu & Adams (2016), JCP 305, 333–359, archived in Fu’s thesis](https://mediatum.ub.tum.de/doc/1370877/996147.pdf#page=72), §§3.1–3.2 and Table 5. Canonical stencil ordering is explicitly reconciled in the page.
- [Han & Li (2023), Mathematics 11, 4449](https://www.mdpi.com/2227-7390/11/21/4449#sec2dot2-mathematics-11-04449), §2.2, Eq. (16), WENO-Z power-two weighting form.
- [NodePy’s RK method definitions](https://nodepy.readthedocs.io/en/latest/_modules/nodepy/runge_kutta_method.html), SSP22, SSP33 and RK44 tableaus.
- [KaTeX browser documentation](https://katex.org/docs/browser.html), local hosting and HTML/MathML rendering. Version 0.19.1 and fonts are vendored with their licenses.

- [Shu, ICASE Report 97-65 / NASA CR-97-206253](https://ntrs.nasa.gov/api/citations/19980007543/downloads/19980007543.pdf), §2.2–2.3: arbitrary-order WENO reconstruction and finite-volume formulation.
- [Suresh & Huynh (1997), NASA TM-107367](https://ntrs.nasa.gov/api/citations/19970010128/downloads/19970010128.pdf), §2, Eq. (2.1), and Appendix A: unlimited fifth-order face and MP5 limiter.
- [Cravero, Puppo, Semplice & Visconti (2018), Math. Comp. 87, 1689–1719](https://arxiv.org/pdf/1607.07319), §3, Eq. (8)–(10), and §5–6: CWENO construction and weight choices.
