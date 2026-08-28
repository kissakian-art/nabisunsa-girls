import type { ReportCard, ReportContext } from '../../lib/reports';

const show = (n: number | null) => (n == null ? '—' : String(n));

/**
 * One printed report card.
 *
 * A student with nothing released still gets a card that says so: a missing
 * card in a stack of forty is far worse than an honest empty one, because
 * nobody can tell whether it was lost.
 */
export function ReportCardView({
  card,
  context,
}: {
  card: ReportCard;
  context: ReportContext;
}) {
  return (
    <div className="report">
      <div className="report-head">
        <div className="school">{context.school.name}</div>
        {context.school.motto && <div className="motto">{context.school.motto}</div>}
        <div className="title">Termly Report</div>
      </div>

      <div className="report-meta">
        <div>
          <div className="k">Student</div>
          {card.lastName} {card.firstName}
        </div>
        <div>
          <div className="k">Registration</div>
          {card.registrationNo}
        </div>
        <div>
          <div className="k">Class</div>
          {card.className}{card.streamName ? ` ${card.streamName}` : ''}
        </div>
        <div>
          <div className="k">Term</div>
          {context.term.name}
        </div>
      </div>

      {card.subjects.length === 0 ? (
        <p className="report-empty">
          No results have been released for this student this term.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th className="num">Coursework</th>
              <th className="num">Exam</th>
              <th className="num">Final</th>
              <th>Grade</th>
              <th className="num">Position</th>
            </tr>
          </thead>
          <tbody>
            {card.subjects.map((subject) => (
              <tr key={subject.subjectId}>
                <td>{subject.subjectName}</td>
                <td className="num">{show(subject.caScore)}</td>
                <td className="num">{show(subject.eotScore)}</td>
                <td className="num"><strong>{show(subject.finalScore)}</strong></td>
                <td>{subject.grade ?? '—'}</td>
                <td className="num">{show(subject.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {card.subjects.length > 0 && (
        <div className="report-summary">
          <div className="s">
            <div className="v">{show(card.average)}</div>
            <div className="l">Average</div>
          </div>
          <div className="s">
            <div className="v">{show(card.totalMarks)}</div>
            <div className="l">Total marks</div>
          </div>
          <div className="s">
            <div className="v">{show(card.totalPoints)}</div>
            <div className="l">Points</div>
          </div>
          <div className="s">
            <div className="v">{card.subjectsCounted}</div>
            <div className="l">Subjects</div>
          </div>
          <div className="s">
            <div className="v">
              {card.overallPosition == null
                ? '—'
                : `${card.overallPosition} of ${card.groupSize}`}
            </div>
            <div className="l">Position in class</div>
          </div>
        </div>
      )}

      <div className="report-sign">
        <div>Director of Studies</div>
        <div>Head Teacher</div>
        <div>Parent / Guardian</div>
      </div>
    </div>
  );
}
