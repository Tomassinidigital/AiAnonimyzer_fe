import { useEffect, useState } from "react";
import { useFeedbackStore } from "@/store/feedbackStore";
import { fmtElapsed } from "@/utils/format";

export function ActivityBar() {
  const activity = useFeedbackStore((s) => s.activity);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activity.visible || activity.startedAt == null) return;
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - activity.startedAt!) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [activity.visible, activity.startedAt]);

  if (!activity.visible) return null;

  const indeterminate = !activity.error && (activity.progress || 0) < 0.05;
  return (
    <div
      className={`activity-bar${activity.error ? " error" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="spinner spinner-sm" aria-hidden="true" />
      <div className="ab-body">
        <div className="ab-msg">
          <b className="ab-label">{activity.label}</b>
          <span className="ab-detail">{activity.detail}</span>
        </div>
        <div className="progress">
          <div className={`progress-bar${indeterminate ? " indeterminate" : ""}`}>
            <span
              style={{ width: `${(activity.progress || 0.02) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <span className="ab-time">{fmtElapsed(elapsed)}</span>
    </div>
  );
}
