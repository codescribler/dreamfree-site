export function AmbientBlobs() {
  return (
    <>
      <div
        className="pointer-events-none absolute -top-[5%] -right-[8%] z-0 h-[clamp(320px,40vw,600px)] w-[clamp(320px,40vw,600px)] rounded-full opacity-0 blur-[80px] [animation:blob-fade-in_2s_var(--ease-smooth)_forwards,blob-drift-1_25s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle, rgba(13,115,119,0.08) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-[6%] bottom-[10%] z-0 h-[clamp(250px,30vw,450px)] w-[clamp(250px,30vw,450px)] rounded-full opacity-0 blur-[80px] [animation:blob-fade-in_2s_var(--ease-smooth)_0.5s_forwards,blob-drift-2_30s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle, rgba(13,115,119,0.06) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
    </>
  );
}
