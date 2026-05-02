import { useState } from "react";

type Props = {
  githubUsername?: string;
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
  name,
  size = 32,
  className = "",
  rounded = "full",
}: Props) {
  const [errored, setErrored] = useState(false);
  const showImage = !!githubUsername && !errored;
  const radius = rounded === "full" ? "rounded-full" : "rounded-xl";

  return (
    <div
      className={`relative ${radius} overflow-hidden grid place-items-center bg-surface-sunken text-foreground ring-1 ring-border shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      title={name}
    >
      {showImage ? (
        <img
          src={`https://github.com/${githubUsername}.png?size=${Math.ceil(size * 2)}`}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-medium leading-none">{initialsOf(name)}</span>
      )}
    </div>
  );
}
