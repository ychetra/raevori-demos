/** Slim ink bar on top of every demo page. */
export function DemoBar({ home = false }: { home?: boolean }) {
  return (
    <div className="bg-ink text-ink-fg">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-[18px] py-2 text-[12px] sm:text-[13px]">
        {home ? (
          <span><b className="font-semibold">Raevori Studio</b> · live demos</span>
        ) : (
          <a href="/" className="hover:text-white">A live demo by <b className="font-semibold">Raevori Studio</b></a>
        )}
        <a href={home ? "https://raevori.com" : "https://raevori.com/#contact"} className="font-medium whitespace-nowrap text-ink-accent hover:text-white">
          {home ? "raevori.com →" : "Build one like this →"}
        </a>
      </div>
    </div>
  );
}
