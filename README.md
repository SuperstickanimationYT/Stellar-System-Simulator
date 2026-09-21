# Stellar system simulator

A rotating core of molecular hydrogen collapses under its own gravity. It has gas pressure, so it
collapses only when it is genuinely unstable, and the dense centre turns into a protostar that
accretes what falls onto it.

Gravity, smoothed particle hydrodynamics, shock dissipation, sink accretion. Composition is
tracked per particle and carried through every merge, but nothing reads it yet. Photons and fusion
have places to attach and are not implemented.

## Running it

Needs Node `^20.19.0 || >=22.12.0`. Vite 8 bundles with Rolldown, whose native binary npm skips
without a warning on older Node, leaving a misleading "Cannot find native binding" error at
startup.

```bash
npm install && npm run dev
```

Open the URL that prints. Opening `index.html` from disk cannot work, because the browser would
have to run TypeScript directly.

If `node_modules` was installed under an older Node, upgrading Node is not enough on its own. npm
recorded the binary as skipped and will not revisit that, so the same startup error survives the
upgrade. Delete `node_modules` and install again.

`npm run typecheck` checks types without emitting. `npm run build` typechecks and then bundles
into `dist/`.

## The model

Everything is SI internally. Kilograms, metres, seconds. `src/sim/constants.ts` holds the
conversions to Earth, Jupiter and solar masses, astronomical units, parsecs and years, plus the
two fusion thresholds.

Gravity is a direct pairwise inverse square sum over every pair. A velocity Verlet integrator
advances the system, and the timestep adapts to the worst particle each step: the smallest of an
acceleration limit, a travel limit, and, when gas is on, a Courant limit of
`courantSafety·h/(c_s + v)`.

### Gas pressure

`src/sim/pressure.ts` is smoothed particle hydrodynamics. Each particle carries a smoothing length
`h` set so that the kernel holds a roughly constant number of neighbours, solved by iterating
`h = η(m/ρ)^(1/3)` against the cubic spline density sum. Pressure follows from a barotropic
equation of state,

```
P = c_s² ρ [1 + (ρ/ρ_opaque)^(γ-1)]      T = T_floor [1 + (ρ/ρ_opaque)^(γ-1)]
```

which is what star formation codes use when they have no radiative transfer. Below `ρ_opaque` the
gas radiates freely and stays at 10 K, so collapse is isothermal. Above it the gas is optically
thick, cannot dump its compressional heating, and stiffens to adiabatic. That is the knee which
eventually halts collapse and forms a hydrostatic core.

The force uses the symmetrised gradient, so each pair pushes apart along the line joining it with
equal and opposite impulses. Linear momentum and angular momentum are conserved exactly. When gas
is on, gravity is softened at the pair's mean smoothing length, because mass is already smeared
over `h` and unsoftened point gravity below that scale is an artefact. Without that softening,
particles slingshot and the run gains hundreds of percent of energy out of nothing.

### Pressure changes whether the cloud collapses at all

This is the point of having it. A cloud in vacuum collapses only if gravity beats thermal
pressure, which for a uniform sphere means

```
M > 5 c_s² R / G
```

The Bonnor-Ebert mass does not apply here, because that assumes the core is confined by an
external pressure and this one sits in vacuum. Using it gives an answer that is wrong by a factor
of several, and the simulation will cheerfully expand while an incorrect stability estimate says
it should collapse.

At 10 K the sound speed is 188 m/s and the critical mass is 2.06 M☉ at 0.05 pc but only 0.41 M☉ at
0.01 pc. That is why the default core is 1 M☉ in 0.01 pc, which is supercritical by 2.43. Enlarge
it past about 0.024 pc with gas on and it will sit there and slowly disperse, correctly.

### Sinks, and the resolution limit that forces them

SPH cannot resolve gravitational collapse below roughly `2·N_neighbour·m_particle`. At 200
particles in a solar mass that floor is around half a solar mass, which is most of the cloud, so
the collapse stalls long before it reaches `ρ_opaque` and no protostar ever forms.

Real codes answer this with sink particles, and so does this one. When a particle's density passes
`sink.density` it becomes a core and accretes neighbours within `accretionFraction·h` rather than
on geometric contact. The threshold defaults to whichever comes first of the opaque density and a
hundred times the initial mean density, the latter standing in for the resolution limit. So the
protostar's mass is resolution dependent, and the honest way to read it is as the mass of the
unresolved central region rather than a converged prediction. It happens to be stable here: 0.150
M☉ at 200 particles against 0.145 M☉ at 400.

### Merging conserves momentum rather than averaging

The obvious reading of "combine two particles" is that the new position, velocity and composition
are each the plain average of the parents. That does not conserve momentum once the parents have
different masses, which happens immediately after the first merge. The dropdown switches between
them live. Measured over four free-fall times, unweighted averaging invents a bulk drift worth 11%
of the cloud's virial speed out of nothing and destroys three quarters of the angular momentum, so
the default is the mass weighted version. Composition blends by mass too, that being the only
blend which conserves the mass of each element.

Merging banks its lost kinetic energy as `thermalEnergy` and the deleted pair potential as
`bindingEnergy`. Orbital angular momentum is not conserved by a merge, because particles have no
spin, and that remains the largest approximation in the model.

### Shock dissipation

`src/sim/dissipation.ts` damps the approach velocity of neighbouring particles along the line of
centres, conserving both momenta exactly and banking the energy as heat. With gas on it is ordinary
SPH artificial viscosity and its reach follows the smoothing length.

It defaults to off. On its own, without pressure, it does not produce a disk: across reach 2.5 to
12 and timescales 1 down to 0.1 free-fall times, flattening stays between 1.0 and 1.55 while the
banked heat varies twelvefold. Thin disks need infall to shock against something, and that is what
pressure provides. Turn it on with gas on and it behaves; turn it on with gas off and it mostly
makes neighbours stick together sooner.

## What happens at the defaults

One solar mass in 0.01 pc, 200 particles, β = 0.02. Mean number density 4.15×10⁶ cm⁻³, free-fall
time 16.6 kyr, supercritical by 2.43.

| time | particles | largest | protostars | peak T | flattening | L / L₀ |
| --- | --- | --- | --- | --- | --- | --- |
| 1 t_ff | 200 | 0.005 M☉ | 0 | 10.2 K | 1.17 | 1.0000 |
| 2 t_ff | 162 | 0.150 M☉ | 1 | 10.2 K | 1.22 | 0.9715 |
| 4 t_ff | 161 | 0.150 M☉ | 1 | 10.0 K | 1.13 | 0.9715 |
| 8 t_ff | 161 | 0.150 M☉ | 1 | 10.0 K | 1.08 | 0.9715 |

A single 0.150 M☉ protostar forms at two free-fall times, about 33 kyr, and crosses the 0.08 M☉
hydrogen fusion threshold. Bodies past that threshold are drawn white with a warm halo.

Turning gas off is the interesting comparison. Gravity alone shatters the same cloud into two
protostars totalling 0.645 M☉ and reaches a flattening of 2.59. Pressure suppresses fragmentation,
which is exactly what it does in reality, and it is the clearest thing in the model to look at.

There is still no disk. A flattening near 1.1 is a mildly oblate blob, and real protoplanetary
disks are nearer 100 to 1. Getting one needs enough resolution to follow the gas past the opaque
density rather than handing it to a sink, which means far more particles than this runs.

### Reading the energy number

With gas off, energy drift is a genuine check on the integrator and stays near a percent. With gas
on it is not, because a barotropic equation of state radiates compressional heating away by
construction and nothing tracks where it went. Use angular momentum as the integrator check
instead: it holds at 1.0000 until sinks start accreting, and the loss after that is the merge
approximation, not the integrator.

## Tuning

Everything lives in `defaultSettings` in `src/sim/simulation.ts`. The panel toggles gas pressure
and edits the dissipation timescale and merge rule live, and β, particle count and seed on reset.
Particle count is a resolution control, since total mass is held fixed.

Two settings dominate. `cloudRadius` decides whether the cloud is unstable at all, by the criterion
above. `bulkDensity` sets the geometric merge radius and therefore how collisional the run is when
gas is off; with gas on the sink radius takes over and it matters much less.

## Adding photons and fusion

`ParticleKind` already distinguishes `Matter` from `Photon`, and gravity, SPH, dissipation, merging
and the diagnostics all skip anything that is not `Matter`. The integrator kicks only matter and
drifts everything, so a photon added today would already move in a straight line and would neither
attract nor merge.

Every particle carries a temperature and a density from the equation of state, plus `thermalEnergy`
banked from merges and shocks, and `HYDROGEN_FUSION_THRESHOLD` and `DEUTERIUM_FUSION_THRESHOLD` are
in `constants.ts`. Fusion means moving mass fractions along the element list in `elements.ts` and
emitting photons, both on the particle that `Simulation.step` already walks.

The honest next step is not fusion though. It is a neighbour grid and a Barnes-Hut tree. Every pass
here is quadratic in particle count, which caps the run at a few hundred particles, and a few
hundred is well below what SPH needs to resolve a protostar without leaning on a sink. Resolution
is what currently limits both the disk and the accuracy of the protostar mass.

## Layout

```
src/sim/                physics, no DOM
  constants.ts          SI constants, unit conversions, fusion thresholds
  elements.ts           element table and composition helpers
  particles.ts          ParticleStore, typed arrays, add and remove
  gravity.ts            pairwise inverse square, optionally softened at h
  pressure.ts           SPH kernel, adaptive h, barotropic equation of state
  merging.ts            contact grouping, sink accretion, the merge rules
  dissipation.ts        pairwise shock damping of approaching neighbours
  simulation.ts         velocity Verlet, adaptive timestep, step order
  initialConditions.ts  seeded rotating cloud, free-fall time
  diagnostics.ts        energy, momenta, flattening, peak density, protostars
src/render/             orbit camera, canvas drawing, mass palette
src/ui/                 readouts
src/main.ts             wiring, input, animation loop
```
