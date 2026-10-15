/**
 * robots.txt check (pure): the group for our agent (or "*") and its
 * Allow/Disallow rules, longest match wins, as in RFC 9309.
 */

export const ROBOT_NAME = "Vertice";

export function robotsAllows(robotsTxt: string | null, path: string, agent = ROBOT_NAME): boolean {
  if (!robotsTxt) return true;
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a))) ?? groups.find((g) => g.agents.includes("*"));
  if (!mine) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of mine.rules) {
    if (r.path === "") continue; // "Disallow:" with no path allows everything
    const pattern = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (pattern.test(path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}
