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

The hamstrings' share at the hip (deadlift, RDL, hip thrust, split squat). Still to get:
- Isometric hip extension at 15° vs 90° of knee bend, 10 men, torque plus EMG of the hamstrings, adductor magnus and gluteus maximus. Japanese Journal of Physical Fitness and Sports Medicine: <https://jlc.jst.go.jp/DN/JLC/20011214456?from=WPRIM>. Snippet: more torque and more hamstring EMG with the knee nearly straight; more gluteus maximus EMG with it bent.
- Sprinters and hurdlers, supine dynamometer, isometric and concentric hip extension with the knee at 30° vs about 90°: <https://lida.sport-iat.de/ta/Record/4080023?lng=en>. Snippet: 29–42% more hip-extension torque with the knee straighter, at every speed.
- Waters RL et al. (1974; co-authors still to check). "The relative strength of the hamstrings during hip extension." J Bone Joint Surg Am 56(8):1592–1597. Cited by Rajagopal et al. 2016 for hip-extension strength; the title is the open question exactly.
- Chen & Franklin's collection (read) found hip extension nearly flat with knee angle in three datasets, against the two studies above. Waters et al. would settle which applies to lifting.

### Machine cam profiles

- Folland J, Morris B (2008). Variable-cam resistance training machines: do they match the angle–torque relationship in humans? J Sports Sci 26(2):163–169. Eight knee-extension machines from six makers, resistive torque measured at five knee angles. Would replace the illustrative leg-extension cam with measured ones (makers likely anonymised).

### Hip adduction strength, general population

The 247 Nm adductor peak is from trained ice hockey players and sits above every dataset in Chen & Franklin's collection. Candidate: Danneskiold-Samsøe et al. 2009 (normative isometric and isokinetic strength, hip included), listed in Chen & Franklin's study table; full citation still to check.

### Muscle activation weights

The largest group of `TODO`s (every `muscles` entry). No single source covers them; it needs EMG studies per exercise, ideally ones that report several muscles in the same lift. No candidates checked yet.

## Read

- **Chen & Franklin 2025, joint moments** (preprint, CC BY 4.0) and **Chen & Franklin 2025, moment arms** (Ann Biomed Eng 53:1757–1776, open access): read; used as a cross-check (`docs/model-limits.md`). Their raw data are still to get: moment arms at <https://doi.org/10.6084/m9.figshare.26018563>; the joint-moment data link is in the published J Biomech version (the preprint says "link-to-add"). Both are MATLAB `.mat` files.
- **Rajagopal et al. 2016** (OpenSim full-body model): read. Muscle forces and moment arms need the model files from <https://simtk.org/home/full_body> and an offline run.

## Open data worth a look

Seen in search results; the sites are blocked from the build environment, so none has been opened yet.

- **EMG datasets** (to be fetched with the papers): PolyF-EMG, 18 people, knee extension, barbell and band bench press (<https://ieee-dataport.org/documents/ployf-emg-comprehensive-multi-muscle-surface-electromyography-dataset-fatigue-analysis>, doi:10.21227/ccze-7z50); EMAHA-DB2, two weight-training activities, isotonic and isometric (<https://ieee-dataport.org/documents/electromyography-analysis-human-activities-database-2>, doi:10.21227/0e4c-zc53). Raw signals, so they could give relative muscle shares for the leg extension and bench press. Read locally like the papers; commit only derived numbers with a citation unless the licence allows more.

## Classic strength-curve sources (not found online)

- Provins KA, Salter N: elbow-flexion strength by forearm position.
- Rasch PJ: elbow-flexion strength by forearm position.

## Checked and unavailable

- Hip rate of torque development and peak torque dataset (MMU e-space, doi:10.23634/MMU.00634821; "Handheld dynamometry validity and reliability of measuring hip joint rate of torque development and peak torque"): taken down from the repository page.
