interface IconProps {
  size?: number;
  className?: string;
}

// Node.js 官方六边形标志（path 来自官方品牌资产的等价矢量，固定品牌绿）
export function NodejsIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="#5FA04E"
      aria-hidden="true"
    >
      <path d="M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383 c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.036,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076 c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.27,0 L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.191,0.139,0.238l2.409,1.391 c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021 c0,1.745-0.951,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921 c0-0.659,0.353-1.275,0.922-1.603l8.795-5.077c0.557-0.315,1.296-0.315,1.848,0l8.791,5.077c0.57,0.329,0.924,0.944,0.924,1.603 v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.791,5.078c-0.28,0.163-0.6,0.247-0.924,0.247z M14.516,17.029 c-3.795,0-4.589-1.741-4.589-3.201c0-0.139,0.113-0.252,0.254-0.252h1.138c0.127,0,0.232,0.092,0.251,0.217 c0.171,1.157,0.683,1.741,3.006,1.741c1.848,0,2.635-0.418,2.635-1.399c0-0.565-0.224-0.985-3.104-1.267 c-2.407-0.238-3.893-0.769-3.893-2.693c0-1.774,1.496-2.831,4.003-2.831c2.816,0,4.211,0.977,4.387,3.077 c0.006,0.072-0.019,0.141-0.065,0.193c-0.047,0.049-0.112,0.079-0.181,0.079h-1.142c-0.119,0-0.223-0.084-0.248-0.199 c-0.276-1.34-1.115-1.768-2.757-1.768c-2.03,0-2.266,0.707-2.266,1.237c0,0.642,0.278,0.829,3.007,1.19 c2.704,0.358,3.989,0.864,3.989,2.753c0,1.909-1.596,2.996-4.385,2.996z" />
    </svg>
  );
}

// 导入本地 SVG 图标
import ClaudeSvg from "@/icons/extracted/claude.svg?url";
import OpenAISvg from "@/icons/extracted/openai.svg?url";
import GeminiSvg from "@/icons/extracted/gemini.svg?url";
import OpenClawSvg from "@/icons/extracted/claw.svg?url";

export function ClaudeIcon({ size = 16, className = "" }: IconProps) {
  return (
    <img
      src={ClaudeSvg}
      width={size}
      height={size}
      className={className}
      alt="Claude"
      loading="lazy"
    />
  );
}

export function CodexIcon({ size = 16, className = "" }: IconProps) {
  return (
    <img
      src={OpenAISvg}
      width={size}
      height={size}
      className={`dark:brightness-0 dark:invert ${className}`}
      alt="Codex"
      loading="lazy"
    />
  );
}

export function GeminiIcon({ size = 16, className = "" }: IconProps) {
  return (
    <img
      src={GeminiSvg}
      width={size}
      height={size}
      className={className}
      alt="Gemini"
      loading="lazy"
    />
  );
}

export function OpenClawIcon({ size = 16, className = "" }: IconProps) {
  return (
    <img
      src={OpenClawSvg}
      width={size}
      height={size}
      className={className}
      alt="OpenClaw"
      loading="lazy"
    />
  );
}

// MCP icon uses inline SVG to support currentColor for hover effects
export function McpIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      height={size}
      width={size}
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z" />
      <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z" />
    </svg>
  );
}
