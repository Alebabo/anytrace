import { Github, Linkedin, Twitter } from "lucide-react";
import type { SignalPlatform } from "@/data/types";

const map = {
  twitter: { Icon: Twitter, color: "hsl(var(--signal-twitter))", label: "X / Twitter" },
  linkedin: { Icon: Linkedin, color: "hsl(var(--signal-linkedin))", label: "LinkedIn" },
  github: { Icon: Github, color: "hsl(var(--signal-github))", label: "GitHub" },
} as const;

export function SignalIcon({
  platform,
  className = "h-3.5 w-3.5",
}: {
  platform: SignalPlatform;
  className?: string;
}) {
  const { Icon, color } = map[platform];
  return <Icon className={className} style={{ color }} />;
}

export const platformLabel = (p: SignalPlatform) => map[p].label;
export const platformColor = (p: SignalPlatform) => map[p].color;
