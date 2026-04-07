interface ScoreContextProps {
  score: number;
}

export function ScoreContext({ score }: ScoreContextProps) {
  let message: string;

  if (score < 50) {
    message = `A score of ${score} means your website is likely losing the majority of potential customers before they ever get in touch.`;
  } else if (score < 70) {
    message = `A score of ${score} means your website is converting some visitors, but there's significant room to capture more leads.`;
  } else {
    message = `A score of ${score} means your website communicates well — but there are still opportunities to sharpen your message and win more business.`;
  }

  return (
    <div className="mt-4 text-center">
      <p className="text-[0.95rem] leading-[1.6] text-slate">{message}</p>
      <p className="mt-2 text-[0.875rem] text-muted">
        Your Signal Score predicts how effectively your website turns visitors
        into customers. The higher your score, the more leads your site
        generates.
      </p>
    </div>
  );
}
