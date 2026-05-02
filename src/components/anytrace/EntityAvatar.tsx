import { useEffect, useMemo, useState } from "react";

type Props = {
  githubUsername?: string;
  imageUrls?: string[];
  name: string;
  size?: number;
  className?: string;
  rounded?: "full" | "xl";
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

export function EntityAvatar({
  githubUsername,
  imageUrls = [],
  name,
  size = 32,
  className = "",
  rounded = "full",
}: Props) {
  const fallbackGithubUrl = githubUsername ? `https://github.com/${githubUsername}.png?size=${Math.ceil(size * 2)}` : null;
  const sources = useMemo(
    () => [...imageUrls, fallbackGithubUrl].filter((value): value is string => !!value),
    [fallbackGithubUrl, imageUrls],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const activeSource = sources[sourceIndex] ?? null;
  const radius = rounded === "full" ? "rounded-full" : "rounded-xl";

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  return (
    <div
      className={`relative ${radius} overflow-hidden grid place-items-center bg-surface-sunken text-foreground ring-1 ring-border shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      title={name}
    >
      {activeSource ? (
        <img
          src={activeSource}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setSourceIndex((current) => current + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-medium leading-none">{initialsOf(name)}</span>
      )}
    </div>
  );
}
