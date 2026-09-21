# Stellar system simulator

A rotating cloud of hydrogen collapses under its own gravity. Particles that touch combine into
one. At the default settings the cloud is a solar mass in 0.1 parsec, and the body that grows at
the centre passes the hydrogen fusion threshold after about a million years.

It runs gravity, merging and shock dissipation. Composition is tracked per particle and carried
through every merge, but nothing reads it yet. Photons, temperature and fusion have places to
attach and are not implemented.

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
conversions to Earth, Jupiter and solar masses, astronomical units, parsecs and years, which is
all the display layer uses.

Gravity is a direct pairwise inverse square sum over every pair, in `src/sim/gravity.ts`. There is
a `softeningLength` setting that replaces the squared separation with `r² + ε²`, and it defaults
to 0, so the force is exactly inverse square.

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
| momentum conserving | 2.7e-15 | +0.27% | 1.001 |
| unweighted average | 1.1e-1 | +0.02% | 0.235 |

Unweighted averaging invents a bulk drift worth 11% of the cloud's virial speed out of nothing and
destroys three quarters of the angular momentum. So the default is the mass weighted version:
total mass adds, position becomes the centre of mass, velocity conserves momentum, and composition
is the mass weighted blend, which is also the only blend that conserves the mass of each element.

### Where the merged energy goes

Merging is inelastic, so it loses kinetic energy, and it also deletes the merged pair's mutual
potential energy from the sum. Both are banked on the surviving particle, as `thermalEnergy` for
the heat and `bindingEnergy` for the absorbed gravitational term. Keeping them closes the energy
ledger, which is what makes the energy drift readout an honest check on the integrator instead of
a number that jumps at every merge. Keeping them apart is what fusion will need later, since the
heat is the part that sets a temperature.

Orbital angular momentum is not conserved by a merge. Two particles spiralling together carry
angular momentum about their common centre that has nowhere to go, because particles have no spin.
That is the single largest approximation in the model.

### Shock dissipation, and what it does not do

`src/sim/dissipation.ts` damps the approach velocity of neighbouring particles, which is what a
shock does to gas. Each impulse acts along the line joining the pair and is equal and opposite, so
linear momentum and angular momentum are both conserved exactly rather than approximately, and
only approaching pairs are damped, so ordered shear survives. The kinetic energy removed is banked
as `thermalEnergy`, leaving the energy ledger closed. The neighbourhood is `reach` multiples of the
mean interparticle spacing, recomputed each step so it shrinks as the cloud collapses.

It defaults to off, because on its own it does not do the thing dissipation is supposed to do.

Real clouds form thin disks because infalling gas shocks against the growing disk, converting
infall energy to heat that is then radiated away, so material settles with almost nothing left but
its angular momentum. That chain needs pressure, because pressure is what stops the gas and
creates the shock in the first place. This model has no pressure. Nothing stops infall, so there
is no shock surface, and pairwise damping only ever sees the small velocity differences between
neighbours that are falling inward together.

Measured, across `reach` from 2.5 to 12 and dissipation timescales from 1 down to 0.1 free-fall
times, flattening stays between 1.0 and 1.55 while the banked heat ranges over a factor of twelve.
More dissipation does not produce a disk. It mostly makes neighbours stick together and merge
sooner, which costs resolution.

So the module is the shock heating half of a chain whose other halves are missing. It is worth
having because it fills `thermalEnergy`, which is what temperature and fusion will read, and
because it becomes correct as soon as pressure exists. Turn it on to watch heat accumulate. Do not
expect a disk from it.

### Initial conditions

`buildRotatingCloud` samples a uniform sphere from a seeded generator, so a given seed always
gives the same cloud, then applies solid body rotation about the z axis and subtracts the net
momentum. Rotation is set by `rotationalEnergyFraction`, the ratio β of rotational to
gravitational energy, rather than by an angular velocity, because β is the quantity that is
actually observed for molecular cloud cores and 0.02 is a typical value. For a uniform sphere that
works out to Ω = √(3GMβ/R³), and the virial check confirms it: the simulation reports 2T/|W| =
0.0400 against an expected 2β of 0.040.

## What happens at the defaults

One solar mass in a sphere of 0.1 pc, which is 20,626 AU. That is a mean number density of
4.2×10³ cm⁻³ and a free-fall time of 0.524 Myr, which is an ordinary dense core. Split across 100
particles it is 10.48 Jupiter masses each, at a radius of 7.08 AU.

| time | particles | largest | flattening | energy drift | L / L₀ |
| --- | --- | --- | --- | --- | --- |
| 1 t_ff | 84 | 0.050 M☉ | 2.00 | +0.12% | 1.0009 |
| 2 t_ff | 80 | 0.050 M☉ | 1.47 | +0.14% | 1.0017 |
| 4 t_ff | 72 | 0.180 M☉ | 1.40 | +0.27% | 1.0005 |
| 8 t_ff | 68 | 0.240 M☉ | 1.32 | +0.24% | 0.9979 |

The largest body crosses the 0.08 M☉ hydrogen fusion threshold at 2.1 free-fall times, about 1.1
Myr, and reaches 0.24 M☉ by eight. Mass is exact to roundoff and net momentum stays at machine
zero throughout.

Flattening is the ratio of the mass weighted RMS radius in the rotation plane to the RMS extent
along the angular momentum axis. It peaks at 2.0 near one free-fall time and then relaxes.

Two things worth being clear about. A ratio of 2 is an oblate spheroid, not a disk; real
protoplanetary disks are nearer 100 to 1, and the section above explains why this model cannot
reach that. And after the bounce the cloud expands past its starting radius and throws particles
out. That is correct for a hundred point masses with no pressure and nothing to radiate energy
away. The system violently relaxes, a bound core keeps growing, and the rest evaporates.

## Tuning

Everything lives in `defaultSettings` in `src/sim/simulation.ts`. The panel edits the dissipation
timescale and merge rule live, and β, particle count and seed on reset. Particle count is a
resolution control: total mass is held fixed, so more particles means finer sampling rather than
more matter.

`bulkDensity` is the one to reach for first, because it sets particle radius and therefore how
collisional the cloud is. At 4e-11 the particles are 33 AU across, collisions dominate, and only
40 of the original 100 survive four free-fall times. At 4e-8 they are 3.3 AU and 82 survive. The
default of 4e-9 gives 7.08 AU, which keeps 72 and holds angular momentum best.

## Adding photons, temperature and fusion

`ParticleKind` already distinguishes `Matter` from `Photon`, and gravity, merging, dissipation and
the diagnostics all skip anything that is not `Matter`. The integrator kicks only matter and
drifts everything, so a photon added today would already move in a straight line at whatever
velocity it was given, and would neither attract nor merge.

`thermalEnergy` accumulates heat from merges and from shock dissipation, and nothing consumes it
yet. Turning it into a temperature needs a heat capacity, which needs the composition, which is
already tracked.

`src/sim/elements.ts` holds ten elements from hydrogen to iron with mass fractions per particle.
`HYDROGEN_FUSION_THRESHOLD` and `DEUTERIUM_FUSION_THRESHOLD` in `constants.ts` are the masses that
matter. Fusion means moving fractions along the element list and emitting photons, both on the
particle that the `Simulation.step` loop already walks.

The order to build these in is not the obvious one. Pressure should come before radiative cooling,
because without pressure there is no shock for cooling to act on, and cooling alone demonstrably
does not flatten anything. Pressure should also come before fusion, because a star is a ball held
up by pressure against gravity, and a fusing body with no pressure has no reason to stop
collapsing. Pressure also gives a real Jeans criterion, so clouds would collapse only when they
actually should, instead of always.

The cost of a step is quadratic in particle count, from the gravity sum, the contact search and
the dissipation pass. That is fine for the hundreds of particles this version runs. A cloud large
enough to need photons will need a Barnes-Hut tree for gravity and a spatial grid for the pair
searches, and both fit behind the existing function signatures.

## Layout

```
src/sim/                physics, no DOM
  constants.ts          SI constants, unit conversions, fusion thresholds
  elements.ts           element table and composition helpers
  particles.ts          ParticleStore, typed arrays, add and remove
  gravity.ts            pairwise inverse square accelerations
  merging.ts            contact grouping and the merge rules
  dissipation.ts        pairwise shock damping of approaching neighbours
  simulation.ts         velocity Verlet, adaptive timestep, step order
  initialConditions.ts  seeded rotating cloud, free-fall time
  diagnostics.ts        energy, momentum, angular momentum, flattening
src/render/             orbit camera, canvas drawing, mass palette
src/ui/                 readouts
src/main.ts             wiring, input, animation loop
```
