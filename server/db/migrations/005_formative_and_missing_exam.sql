-- How a school arrives at the formative mark, and what a missing exam means.
--
-- Two schools can both use 20/80 and still disagree about everything that
-- matters underneath it.
--
-- THE FORMATIVE MARK
-- Nabisunsa's report shows a "FRMTV SCORE (20%)" column holding whole
-- numbers: 20, 18, 18, 17, 14, 14, 11, 10. One subject has 20 out of 20
-- beside an exam of 46 out of 80. That is not the output of a formula, it is
-- a teacher's judgement written down, and nobody at the school could explain
-- an arithmetic rule for it because there is not one.
--
-- So the system must be able to take that number as an input rather than
-- derive it. A system that computes it owns it, and would spend every term
-- arguing arithmetic with the person whose judgement is the actual input.
--
-- 'computed' keeps the existing behaviour: average the coursework scores,
-- optionally the best N, out of 100, then weight.
-- 'entered' means the office types one mark already out of ca_weight,
-- exactly as it appears on the teacher's paper marksheet.
--
-- A MISSING EXAM
-- The same report shows French: formative 11, no exam, total 11, grade E.
-- That school treats an unsat paper as zero. This system currently excludes
-- it, leaving the result incomplete — the kinder reading, and the wrong one
-- for a school that has decided otherwise. Neither is a bug; it is policy,
-- and policy belongs in configuration.

ALTER TABLE school_grading_config
  ADD COLUMN formative_source ENUM('computed','entered') NOT NULL DEFAULT 'computed'
    COMMENT 'computed = average coursework out of 100; entered = the office types a mark out of ca_weight'
    AFTER ca_best_of,
  ADD COLUMN missing_exam_rule ENUM('excluded','zero') NOT NULL DEFAULT 'excluded'
    COMMENT 'excluded = no final mark until the paper is sat; zero = an unsat paper scores nothing'
    AFTER formative_source;
