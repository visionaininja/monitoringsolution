const fs = require('fs');
const path = require('path');

const overviewPath = path.join(__dirname, 'src', 'pages', 'Overview.tsx');
const code = fs.readFileSync(overviewPath, 'utf-8');

const lines = code.split('\n');

// Find markers
const markers = {};
lines.forEach((line, i) => {
  if (line.includes('// ─── Helpers')) markers.helpers = i;
  if (line.includes('// ─── Detail Overlay')) markers.detailOverlay = i;
  if (line.includes('// ─── Stat Card')) markers.statCard = i;
  if (line.includes('// ─── Docker Overview Section')) markers.docker = i;
  if (line.includes('// ─── Main Overview Component')) markers.main = i;
});

console.log(markers);

const imports = lines.slice(0, markers.helpers).join('\n');
const helpers = lines.slice(markers.helpers, markers.docker).join('\n');
const dockerSection = lines.slice(markers.docker, markers.main).join('\n');
const mainComponent = lines.slice(markers.main).join('\n');

fs.writeFileSync(path.join(__dirname, 'src', 'components', 'OverviewHelpers.tsx'), 
`import React, { useEffect } from "react";
import { X, Play, CheckCircle2, XCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

` + helpers);

fs.writeFileSync(path.join(__dirname, 'src', 'pages', 'DockerOverview.tsx'),
`import React, { useState, useEffect, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Container, AlertTriangle, RefreshCw, Download, UploadCloud, Users, WifiOff, Wifi, Activity, Globe } from "lucide-react";
import { ResponsiveContainer, Tooltip, BarChart, Bar, Cell, XAxis, YAxis, PieChart, Pie } from "recharts";
import { cn } from "@/lib/utils";
import { Environment } from "@/context/EnvironmentContext";

const fmtRelative = (dateStr: string) => {
  if (!dateStr) return ""
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return \`\${diff}s ago\`
  if (diff < 3600) return \`\${Math.floor(diff / 60)}m ago\`
  if (diff < 86400) return \`\${Math.floor(diff / 3600)}h ago\`
  return \`\${Math.floor(diff / 86400)}d ago\`
}

` + dockerSection + `

export default function DockerOverviewWrapper() {
  // Normally context would pass env, let's hardcode for the standalone view or use hook
  return <DockerOverviewSection environment="dev" />
}
`);

console.log("Extracted Helpers and DockerOverviewSection");
