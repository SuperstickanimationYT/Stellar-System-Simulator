# Stellar system simulator

A diffuse cloud of hydrogen particles collapses under its own gravity. Particles that touch
combine into one. The cloud carries a small amount of rotation that the collapse amplifies.

This is the first version. It runs gravity and merging only. Composition is tracked per particle
and carried through every merge, but nothing reads it yet. Photons, temperature and fusion have
places to attach and are not implemented.

## Running it

Needs Node `^20.19.0 || >=22.12.0`. Vite 8 bundles with Rolldown, whose native binary npm skips
without a warning on older Node, leaving a misleading "Cannot find native binding" error at
startup.

```bash
npm install && npm run dev
```

`npm run typecheck` checks types without emitting. `npm run build` typechecks and then bundles
into `dist/`.

## The model

Everything is SI internally. Kilograms, metres, seconds. `src/sim/constants.ts` holds the
conversions to Earth masses, astronomical units and years, which is all the display layer uses.

Gravity is a direct pairwise inverse square sum over every pair, in `src/sim/gravity.ts`. There is
a `softeningLength` setting that replaces the squared separation with `r² + ε²`, and it defaults
to 0, so the force is exactly inverse square. Softening changed the answer by under three parts in
a thousand at these densities, so it is there for when particles get much smaller rather than
because the current setup needs it.

A velocity Verlet integrator advances the system. The timestep adapts to the worst particle each
step, taking the smaller of `safety·√(radius/acceleration)` and `safety·radius/speed`. The second
term is what stops a fast particle from crossing another particle's contact shell inside one step
and missing the merge entirely.

Particle radius follows from mass and a `bulkDensity` setting, so radius grows as the cube root of
mass and two particles merge when their surfaces touch. Chains matter: three or more particles can
touch at once, so `src/sim/merging.ts` groups every mutually touching set with union-find and
collapses each group in one operation rather than merging pairwise and depending on the order.

### Merging conserves momentum rather than averaging

The obvious reading of "combine two particles" is that the new position, velocity and composition
are each the plain average of the parents. That rule does not conserve momentum once the parents
have different masses, which they do immediately after the first merge.

Both rules are implemented and the dropdown switches between them live. After four free-fall times
at the default settings:

| Merge rule | net momentum, as a fraction of M·v_ff | energy drift | L / L₀ |
| --- | --- | --- | --- |
| momentum conserving | 7.5e-15 | -1.2% | 0.989 |
| unweighted average | 2.1e-1 | +66.9% | 1.571 |

Unweighted averaging invents a bulk drift worth 21% of the cloud's virial speed out of nothing,
inflates total energy by two thirds and grows angular momentum by half. So the default is the mass
weighted version: total mass adds, position becomes the centre of mass, velocity conserves
momentum, and composition is the mass weighted blend, which is also the only blend that conserves
the mass of each element.

### Where the merged energy goes

Merging is inelastic, so it loses kinetic energy, and it also deletes the merged pair's mutual
potential energy from the sum. Both are banked on the surviving particle, as `thermalEnergy` for
the heat and `bindingEnergy` for the absorbed gravitational term. Keeping them closes the energy
ledger, which is what makes the energy drift readout an honest check on the integrator instead of
a number that jumps at every merge. Keeping them apart is what fusion will need later, since the
heat is the part that sets a temperature.

Orbital angular momentum is not conserved by a merge. Two particles spiralling together carry
angular momentum about their common centre that has nowhere to go, because particles have no spin.
That is the single largest approximation in the model and it is why the angular momentum ratio
decays late in a run while energy stays flat.

### Initial conditions

`buildRotatingCloud` samples a uniform sphere from a seeded generator, so a given seed always
gives the same cloud, then applies solid body rotation about the z axis and subtracts the net
momentum. Rotation is set by `rotationalEnergyFraction`, the ratio β of rotational to
gravitational energy, rather than by an angular velocity, because β is the quantity that is
actually observed for molecular cloud cores and 0.02 is a typical value. For a uniform sphere that
works out to Ω = √(3GMβ/R³), and the virial check confirms it: the simulation reports 2T/|W| =
0.0400 against an expected 2β of 0.040.

## What happens at the defaults

100 particles of one Earth mass each, pure hydrogen, in a 100 AU sphere with β = 0.02. The
free-fall time is 10.2 kyr.

| time | particles | largest | energy drift | L / L₀ | flattening |
| --- | --- | --- | --- | --- | --- |
| 1 t_ff | 71 | 5 M⊕ | +0.02% | 0.9996 | 2.23 |
| 2 t_ff | 47 | 18 M⊕ | -1.01% | 0.9965 | 1.50 |
| 4 t_ff | 38 | 32 M⊕ | -1.23% | 0.9888 | 1.45 |
| 8 t_ff | 36 | 50 M⊕ | -1.26% | 0.9169 | 1.43 |

Flattening is the ratio of the mass weighted RMS radius in the rotation plane to the RMS extent
along the axis. It peaks near one free-fall time, which is the rotation being amplified by the
collapse, then relaxes.

After the bounce the cloud expands well past its starting radius and throws particles out beyond
400 AU. That is real behaviour for a hundred point masses with no gas pressure and nothing to
radiate energy away, not a bug. The system violently relaxes, a bound core keeps growing, and
everything else evaporates. Zoom out to follow it, or raise β, which holds the cloud together
better and keeps the flattening above 2.

## Tuning

Everything lives in `defaultSettings` in `src/sim/simulation.ts`. The panel edits β, particle
count and seed, and applies them on reset.

`bulkDensity` is the one to reach for first, because it sets particle radius and therefore how
collisional the cloud is, and the model is very sensitive to it. At 1e-11 kg/m³ the particles are
3.5 AU across and the entire cloud merges into a single body within 1.5 free-fall times. At 1e-6
barely anything merges. The default of 1e-7 gives a 0.16 AU radius, which is the range where the
cloud survives long enough for rotation to do something visible.

## Adding photons, temperature and fusion

`ParticleKind` already distinguishes `Matter` from `Photon`, and gravity, merging and the
diagnostics all skip anything that is not `Matter`. The integrator kicks only matter and drifts
everything, so a photon added today would already move in a straight line at whatever velocity it
was given, and would neither attract nor merge.

`thermalEnergy` accumulates the heat from every merge and nothing consumes it yet. Turning it into
a temperature needs a heat capacity, which needs the composition, which is already tracked.

`src/sim/elements.ts` holds ten elements from hydrogen to iron with mass fractions per particle.
Fusion means moving fractions along that list and emitting photons, both on the particle that the
`Simulation.step` loop already walks.

The cost of a step is quadratic in particle count, from the gravity sum and the contact search.
That is fine for the hundreds of particles this version runs. A cloud large enough to need photons
will need a Barnes-Hut tree for gravity and a spatial grid for contacts, and both fit behind the
existing function signatures.

## Layout

```
src/sim/                physics, no DOM
  constants.ts          SI constants and unit conversions
  elements.ts           element table and composition helpers
  particles.ts          ParticleStore, typed arrays, add and remove
  gravity.ts            pairwise inverse square accelerations
  merging.ts            contact grouping and the merge rules
  simulation.ts         velocity Verlet, adaptive timestep, step order
  initialConditions.ts  seeded rotating cloud
  diagnostics.ts        energy, momentum, angular momentum
src/render/             orbit camera, canvas drawing, mass palette
src/ui/                 readouts
src/main.ts             wiring, input, animation loop
```
