# Reading list

Papers found but not yet read. Each was seen in search results only: check the numbers in the paper before using them.

## To fetch (checklist)

Updated after the break test (open items 15–20). **Read** = in the app (cited in the exercise files and References); **not obtainable** = not available through the user's institution.

| # | Paper | Status | For |
|---|---|---|---|
| 1 | Ramsay, Hunter, Gonzalez (2009), J Biomech 42:463–473 | **Read:** curl muscle levels (normalized potential moments) | Curls |
| 2 | Holzbaur, Murray, Delp (2005), Ann Biomed Eng 33:829–840 | **Read, not used yet:** the OpenSim arm model; for a later OpenSim run (arm, wrist, fingers) | Arm muscle model |
| 3 | Lieber et al. (1992), J Hand Surg Am 17(5):787–798 | **Read:** cross-check only; Gonzalez et al. took their muscle sizes from it (FDP 7.9 cm² in both) | Forearm muscle sizes |
| 4 | Delp, Grierson, Buchanan (1996), J Biomech 29:1371–1375 | **Read:** wrist curls' strength curves and peaks | Wrist strength |
| 5 | Gonzalez, Buchanan, Delp (1997), J Biomech 30:705–712 | **Read:** wrist curls' muscle weights | Wrist muscle shares |
| 6 | Lin, Amadio, An, Cooney (1989), J Hand Surg Am 14:949–956 | **Read:** edge lift's A2/A4 positions | Pulley positions |
| 7 | Lin, Cooney, Amadio, An (1990), J Hand Surg Br 15:429–434 | **Read:** edge lift's pulley breaking loads | Pulley strength |
| 8 | Waters RL et al. (1974), J Bone Joint Surg Am 56(8):1592–1597 | **Not obtainable** | Hip extension vs knee angle |
| 9 | Danneskiold-Samsøe et al. (2009), Acta Physiol 197(Suppl 673):1–68 | **Read:** hip adduction/abduction strength | Strength norms |
| 10 | Provins & Salter (1955), J Appl Physiol 7:393–398 | **Read:** cross-check (neutral grip strongest) | Elbow strength by grip |
| 11 | Folland & Morris (2008), J Sports Sci 26:163–169 | **Read:** leg-extension machine cams | Machine cams |
| 12 | Yamamoto et al. (2015), Jpn J Phys Fitness Sports Med 64:289–294 (the Japanese study) | **Read:** hip-extension strength by knee angle | Hip extension vs knee angle |
| 13 | Sprinters and hurdlers, hip extension at knee 30° vs 90° (<https://lida.sport-iat.de/ta/Record/4080023?lng=en>) | **Not obtainable** | Hip extension vs knee angle |
| 14 | Rasch PJ: elbow-flexion strength by forearm position | **Still unknown:** the fetched Rasch & Morehouse 1957 is a training study (static vs dynamic exercise), not this | Elbow strength by grip |
| 15 | Ferrer-Uris B et al. (2023), PeerJ: forearm muscle activation (FDP, FDS, FCR) in half crimp vs sloper dead-hangs | **New, to fetch** (cited by StrengthClimbing); citation details unchecked | Edge lift: check the FDP/FDS split |
| 16 | Escamilla RF et al. (2000). A three-dimensional biomechanical analysis of sumo and conventional style deadlifts. Med Sci Sports Exerc 32(7):1265–1275. doi:10.1097/00005768-200007000-00013 | **To fetch** (only the abstract read) | Deadlift: hip, knee and ankle angles at lift-off for both styles (sets the knee bend per hip bend), and their joint moments to check the model against |
| 17 | Braman JP et al. (2009), J Shoulder Elbow Surg 18(6):960–967 | **Read** (PMC full text): shoulder-blade rhythm, cited in the four arm-raising exercises | Scapulohumeral rhythm |
| 18 | Latz D et al. (2019), Hand 14(2):259–263 | **Read:** each finger's active knuckle range, the four-finger search's limits | Edge lift |
| 19 | Pull-up / chin-up kinematics: trunk lean and elbow path through the pull, wide pull-up vs chin-up | **To find** (no candidate checked) | Pull-ups: chin-ups come out harder than wide pull-ups (break test) |
| 20 | Plantarflexion strength vs ankle angle with the knee straight, over the full range to about 35° | **To find** (no candidate checked) | Calf raise: effort near the top too high with the knee-bent curve (break test) |
| 21 | Knuckle (MCP head) positions relative to the wrist, per finger; e.g. the geometry of a musculoskeletal hand model (Mirakhorlo et al. 2018 was suggested in a search; unread) | **To find** | Edge lift: the knuckle line is an estimate |

Also read in this batch: Tsunoda et al. 1993 and O'Connell et al. 2021 (curl cross-checks, cited), Bianchi et al. 2007 (ultrasound of the finger flexor system; background, not used).

Details for each are in the sections below.

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
- Waters RL et al. (1974). "The relative strength of the hamstrings during hip extension." J Bone Joint Surg Am 56(8):1592–1597. Cited by Rajagopal et al. 2016 (ref. 61) for hip-extension strength, which confirms title, journal and pages; the co-authors are listed only as "et al." there. The title is the open question exactly.
- Chen & Franklin's collection (read) found hip extension nearly flat with knee angle in three datasets, against the two studies above. Waters et al. would settle which applies to lifting.

### Machine cam profiles

- Folland J, Morris B (2008). Variable-cam resistance training machines: do they match the angle–torque relationship in humans? J Sports Sci 26(2):163–169. Eight knee-extension machines from six makers, resistive torque measured at five knee angles. **Read and cited:** the leg extension now uses its measured profiles (makers are named in the paper).

### Hip adduction strength, general population

**Done (2026-10-09):** the app now uses Danneskiold-Samsøe et al.'s general-population values (men 20–29: adduction 217, abduction 185 Nm). Before: the 247 Nm adductor peak was from trained ice hockey players and sat above every dataset in Chen & Franklin's collection. Candidate: Danneskiold-Samsøe B, Bartels EM, Bülow PM, Lund H, Stockmarr A, Holm CC, Wätjen I, Appleyard M, Bliddal H (2009). Isokinetic and isometric muscle strength in a healthy population with special reference to age and gender. Acta Physiol 197:1–68 (supplement). doi:10.1111/j.1748-1716.2009.02022.x (from Chen & Franklin's reference list; normative isometric and isokinetic strength, hip included).

### Muscle activation weights

The largest group of `TODO`s (every `muscles` entry). No single source covers them; it needs EMG studies per exercise, ideally ones that report several muscles in the same lift. No candidates checked yet.

### Forearm, wrist and fingers (wrist curls, edge lift)

Added 2026-10-08 for the forearm close-up, the wrist curls and the edge lift. First written from memory; on 2026-10-09 Holzbaur et al. 2005 was confirmed in Chen & Franklin's reference list. Delp 1996, Gonzalez 1997 and Lieber 1992 were not found in any read paper, so check them against the papers themselves.

- Ramsay JW, Hunter BV, Gonzalez RV (2009). Muscle moment arm and normalized moment contributions as reference data for musculoskeletal elbow and wrist joint models. J Biomech 42(4):463–473. doi:10.1016/j.jbiomech.2008.11.035 (confirmed in Guenzkofer et al. 2012's references). **For:** reference moment arms and each muscle's normalised share of the elbow and wrist moments: probably the most direct source for the curl and wrist-curl weight levels.

- Delp SL, Grierson AE, Buchanan TS (1996). Maximum isometric moments generated by the wrist muscles in flexion-extension and radial-ulnar deviation. J Biomech 29(10):1371–1375. **For:** wrist flexion and extension strength vs angle, replacing the estimated `strengthCurve` of both wrist curls.
- Gonzalez RV, Buchanan TS, Delp SL (1997). How muscle architecture and moment arms affect wrist flexion-extension moments. J Biomech 30(7):705–712. **For:** each wrist muscle's share of the moment across the range, i.e. the `weight` tables (FCU, FCR, PL, FDS, FDP; ECRL, ECRB, ECU, ED).
- Lieber RL, Jacobson MD, Fazeli BM, Abrams RA, Botte MJ (1992). Architecture of selected muscles of the arm and forearm: anatomy and implications for tendon transfer. J Hand Surg Am 17(5):787–798. **For:** muscle size (physiological cross-section) of the forearm muscles; size × moment arm gives a first estimate of the shares.
- Holzbaur KRS, Murray WM, Delp SL (2005). A model of the upper extremity for simulating musculoskeletal surgery and analyzing neuromuscular control. Ann Biomed Eng 33(6):829–840. doi:10.1007/s10439-005-3320-7. **For:** an OpenSim arm model with the wrist and finger muscles. Could go through the same offline OpenSim step as the Rajagopal leg model (check whether opensim-org/opensim-models on GitHub has it, as it had Rajagopal).

Still to find (no candidate checked):
- Measured per-finger force shares on an edge, per grip type (to test the least-effort split and the quadriga setting).
- Where the pressure centre sits on the finger pad on a 20–25 mm edge.
- A measured half-crimp posture.
- Per-finger moment arms (the four fingers scale the index finger's by size).

Done since: bone lengths per finger and pulley positions (Lin et al. 1989), pulley breaking loads (Lin et al. 1990), muscle sizes per finger (Lieber et al. 1992), knuckle ranges (Latz et al. 2019).
- EMG of the forearm muscles in wrist curls, for the `weight` tables (the same gap as *Muscle activation weights* above).

## Read

- **Edge lift (2026-10-08):** Vigouroux et al. 2006, Schweizer 2001 and An et al. 1983 are read and cited (`data/exercises/edge-lift.json`). An et al. 1979 was read but not used: its tables are normalised 3D tendon positions, too detailed for the 2D finger model. Rispler et al. 1996 (pulley efficiency after sectioning) was read as background, not used. Murray, Delp and Buchanan 1995 (elbow moment arms by angle and forearm rotation) is read and cited: it sets the shape of the curl's elbow-flexor weights.
- **2026-10-09:** Folland & Morris 2008 (leg-extension machine cams), Ono et al. 2011, Messer et al. 2018 and Park & Lim 2023 (how the hamstring heads share the work) are read and cited.
- Fetched by mistake, not needed: Youm et al. 1979 (forearm and elbow kinematics for prostheses), Wu et al. 2009 (thumb model).

- **Chen & Franklin 2025, joint moments** (preprint, CC BY 4.0) and **Chen & Franklin 2025, moment arms** (Ann Biomed Eng 53:1757–1776, open access): read; used as a cross-check (`docs/model-limits.md`). Their raw data are still to get: moment arms at <https://doi.org/10.6084/m9.figshare.26018563>; the joint-moment data link is in the published J Biomech version (the preprint says "link-to-add"). Both are MATLAB `.mat` files.
- **Rajagopal et al. 2016** (OpenSim full-body model): read. Muscle forces and moment arms need the model files and an offline run.

## OpenSim: the next step

Where things stand, so the OpenSim work starts clean:

- **Leg model (Rajagopal et al. 2016), read.** `tools/opensim_export.py` exports, for every right-leg muscle crossing the hip, knee or ankle, its parameters and its moment arms and active/passive force on a hip × knee and a knee × ankle grid, as JSON (`data/opensim/rajagopal-right-leg.json`, not yet produced). Tested only against a stand-in module; the first real run may need a fix, and its `check:` lines print three known moment arms to compare with the paper.
- **What it would replace:** the flat `TODO` muscle weights of the leg exercises (moment arm × force capacity per posture, as the curls and wrist curls already do from papers), and a cross-check of the leg strength curves. Two-joint muscles (hamstrings, rectus femoris, gastrocnemius) would get weights that depend on both joints.
- **Arm and hand (Holzbaur et al. 2005), read:** the same step for the shoulder, elbow, wrist and finger muscles (curls, presses, rows, wrist curls; the edge lift's per-finger moment arms).
- **Open items the model can't settle by itself:** the reading-list items above (pull-up kinematics, knee-straight calf strength, per-finger edge shares) need measurements, not a musculoskeletal model.

## To grab: Rajagopal model files

The model file is also published by the OpenSim team on GitHub, no account needed: `Models/Rajagopal/Rajagopal2016.osim` in <https://github.com/opensim-org/opensim-models> (0.9 MB; the same folder has `RajagopalLaiUhlrich2023.osim`, which allows deeper knee flexion, useful for squats). That folder's README states no licence, so the licence check below still applies. Otherwise from <https://simtk.org/home/full_body> (free account needed for downloads):
- The model file, `.osim` (XML: muscles, path points, wrap surfaces, joint definitions). The bone geometry (`.vtp`) isn't needed.
- The licence text on the project page: check that results derived from the model may be published under CC BY 4.0 (the model file itself stays out of the repo unless its licence allows it, like the papers).

What it is for: moment arms of each leg muscle across hip, knee and ankle angles, plus each muscle's force capacity (Table II of the paper). Together they would give muscle weights that change with the joint angles, replacing the flat `TODO` guesses for the leg muscles. Two ways to run it:
1. With OpenSim installed locally (free; `conda install -c opensim-org opensim`): run `python tools/opensim_export.py Rajagopal2016.osim data/opensim/rajagopal-right-leg.json` (file name as downloaded). It writes moment arms and force capacity for every right-leg muscle on hip × knee and knee × ankle grids. Only that JSON is committed. The script was checked against a stand-in module, not real OpenSim yet, so the first run may need a fix; its `check:` lines print three well-known moment arms to compare against the paper.
2. Without OpenSim: read the `.osim` XML here and compute moment arms from the path points. This ignores the wrap surfaces, so muscles that bend around bone (gluteus maximus, quadriceps over the knee, hamstrings) would come out wrong; only usable as a rough check.


## Open data worth a look

Seen in search results; the sites are blocked from the build environment, so none has been opened yet.

- **EMG datasets** (to be fetched with the papers): PolyF-EMG, 18 people, knee extension, barbell and band bench press (<https://ieee-dataport.org/documents/ployf-emg-comprehensive-multi-muscle-surface-electromyography-dataset-fatigue-analysis>, doi:10.21227/ccze-7z50); EMAHA-DB2, two weight-training activities, isotonic and isometric (<https://ieee-dataport.org/documents/electromyography-analysis-human-activities-database-2>, doi:10.21227/0e4c-zc53). Raw signals, so they could give relative muscle shares for the leg extension and bench press. Read locally like the papers; commit only derived numbers with a citation unless the licence allows more.

## Classic strength-curve sources (not found online)

- Provins KA, Salter N (1955). Maximum torque exerted about the elbow joint. J Appl Physiol 7(4):393–398 (confirmed in Guenzkofer et al. 2012's references): elbow-flexion strength by forearm position.
- Rasch PJ: elbow-flexion strength by forearm position (not found in any read paper; year and title unknown).

## Checked and unavailable

- Hip rate of torque development and peak torque dataset (MMU e-space, doi:10.23634/MMU.00634821; "Handheld dynamometry validity and reliability of measuring hip joint rate of torque development and peak torque"): taken down from the repository page.
