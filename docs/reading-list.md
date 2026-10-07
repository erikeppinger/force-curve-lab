# Reading list

Papers found but not yet read. Each was seen in search results only: check the numbers in the paper before using them.

All of the earlier list has now been read and is cited in the exercise files:
- **Calf:** Cresswell 1995, Baptista 2014, Kovács 2024
- **Rectus femoris:** Black 1993, Worrell 1989, Bampouras 2017
- **Grip:** Mandalidis 2001, Boland 2008, Marcolin 2018, Kleiber 2015, Kohn 2018
- **Triceps:** Maeo 2023, as training context
- **Background:** Naito 1995 was read too: one subject and qualitative, so not cited.
- **Since then:** Uritani 2012 (hip rotation), Coratella 2023 (grip EMG) and Lategan 2002 (horizontal abduction and adduction) are read and cited.

## Still useful

Each would close one remaining `TODO`. All were seen in search results only (the journal sites are blocked from the build environment), so the snippets below need checking against the papers. One snippet for Silva et al. 2006 already turned out wrong against the paper itself.

### Hip extension strength vs knee angle

The hamstrings' share at the hip (deadlift, RDL, hip thrust, split squat). Authors still to check in both:
- Isometric hip extension at 15° vs 90° of knee bend, 10 men, torque plus EMG of the hamstrings, adductor magnus and gluteus maximus. Japanese Journal of Physical Fitness and Sports Medicine: <https://jlc.jst.go.jp/DN/JLC/20011214456?from=WPRIM>. Snippet: more torque and more hamstring EMG with the knee nearly straight; more gluteus maximus EMG with it bent.
- Sprinters and hurdlers, supine dynamometer, isometric and concentric hip extension with the knee at 30° vs about 90°: <https://lida.sport-iat.de/ta/Record/4080023?lng=en>. Snippet: 29–42% more hip-extension torque with the knee straighter, at every speed.

### Machine cam profiles

- Folland J, Morris B (2008). Variable-cam resistance training machines: do they match the angle–torque relationship in humans? J Sports Sci 26(2):163–169. Eight knee-extension machines from six makers, resistive torque measured at five knee angles. Would replace the illustrative leg-extension cam with measured ones (makers likely anonymised).

### Muscle activation weights

The largest group of `TODO`s (every `muscles` entry). No single source covers them; it needs EMG studies per exercise, ideally ones that report several muscles in the same lift. No candidates checked yet.

## Open data worth a look

Seen in search results; the sites are blocked from the build environment, so none has been opened yet.
- **Chen J, Franklin DW (2025). Joint moment–angle/velocity relations in the hip, knee, and ankle: a meta-visualization of datasets. J Biomech 183.** 962 passive, isometric and isokinetic datasets from the literature. Could check or replace the leg strength curves and give strength vs a second joint's angle. Preprint: <https://www.biorxiv.org/content/10.1101/2024.06.22.600197>; author copy: <https://www.hs.mh.tum.de/fileadmin/w00bbr/nd/pdf/Chen_JBiomech_2025.pdf>. Check whether the collected data are published with it, and under which licence.
- **Muscle moment arm–joint angle relations in the hip, knee, and ankle: a visualization of datasets** (same group, open access): <https://pmc.ncbi.nlm.nih.gov/articles/PMC12283864/>. Moment arms per muscle would let the muscle weights follow the joint angle instead of being flat guesses.
- **OpenSim full-body model** (Rajagopal et al. 2016): <https://simtk.org/home/full_body>. Precomputing moment arms or muscle forces offline and storing them as JSON keeps the site build-free. Check the model's licence first.

## Classic strength-curve sources (not found online)

- Provins KA, Salter N: elbow-flexion strength by forearm position.
- Rasch PJ: elbow-flexion strength by forearm position.

## Checked and unavailable

- Hip rate of torque development and peak torque dataset (MMU e-space, doi:10.23634/MMU.00634821; "Handheld dynamometry validity and reliability of measuring hip joint rate of torque development and peak torque"): taken down from the repository page.
