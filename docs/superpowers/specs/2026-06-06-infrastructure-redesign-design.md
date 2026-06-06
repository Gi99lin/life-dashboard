# Infrastructure Tab Redesign — Design Spec

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan
**Visual target:** `dashboard/public/mock-infrastructure.html`
**Supersedes:** the current Grafana-lite `ServerMetrics` panel (gauges + CPU/Net charts + container app cards)

---

## 1. Context & goal

The Infrastructure tab was a plain server-resource panel. **New purpose:** a **homelab cockpit / «мой стек»** that both (a) shows the user's self-hosted stack as a *living system*, and (b) keeps prominent **live host metrics** (the user explicitly enjoys watching the numbers move).

Guiding principle: **«инженерный флекс на базе пользы»**. The centerpiece is a **living stack topology** — something a generic Grafana does not offer out of the box — built automatically from the real infrastructure.

## 2. Why this shape (decisions on record)

- Purpose = **homelab cockpit + keep live metrics** (user's words: «мне нравится периодически смотреть на цифры»).
- Layout = **A: node on top + stack below** (chosen over a pure diagram or a pure telemetry feed).
- Services are **NOT cards and NOT a table/list** — those felt like an "enumeration" with low flex. Chosen: a **living topology** (nodes + edges, status/load/traffic animated).
- Topology is **grouped by real Docker networks** — the user runs *isolated per-app stacks*, each with its **own** Postgres/Redis (no shared DB/Redis). The grouping reflects this and is itself a flex (network segmentation).
- **No local LLM.** All LLM traffic in every service goes **through OmniRoute**, which routes to **external** providers. Topology shows `app → OmniRoute → ☁ внешние LLM`.
- Demo-proof: must look like a live cockpit on stubbed data with zero interaction.

## 3. Information architecture (layout)

```
┌ Header: «Хоумлаб · Мой стек»                         [10м 1ч* 6ч 24ч] ┐
├ TOP:  [ node card + compact vitals (CPU/RAM/Disk/Net) ] | [ BIG live telemetry chart ] ┤
├ STACK TOPOLOGY (живая):                                                │
│   🌐 Интернет → nginx → ┌ docker networks (groups) ┐ → ☁ внешние LLM   │
│                        │ librechat-net {app+pg+redis}                  │
│                        │ omniroute-net {app+pg+redis}                  │
│                        │ guacamole-net {app+guacd+pg} → 🖥️ work-vm(VNC) │
│                        │ dashboard-net {api+collector}                 │
│                        └───────────────────────────┘                  │
│   Netdata · «наблюдает за всеми» (monitoring edges)                    │
└────────────────────────────────────────────────────────────────────────┘
```

Period selector drives the live telemetry chart and per-node sparklines. Sub-tabs removed (single view).

## 4. Components

### 4.1 Host vitals (top-left)
- **Node card:** hostname, status dot (pulse), uptime, hardware (vCPU/RAM), OS/Docker, container count.
- **Compact vitals tile:** CPU / RAM / Disk / Net as 4 mini-rows (value + bar) — the 4 gauges compressed into one tile footprint.

### 4.2 Live telemetry chart (top-right)
- A wide, prominent live area/line chart of host **CPU / RAM / Network** over the selected period (10м/1ч/6ч/24ч). This is the "watch it move" centerpiece. Uses the shared `utils/charts.js`.

### 4.3 Stack topology (main)
A living architecture graph rendered from real infra:
- **Nodes:** services (containers), grouped into **Docker-network boxes**; standalone nodes for `nginx` (gateway), `🌐 Интернет`, `☁ внешние LLM`, `🖥️ work-vm`, `Netdata`.
- **Per node:** status (color + pulse for active), **CPU-load ring**, memory, tech badge; apps get **«↗ открыть»**.
- **Network groups:** each Docker network = a labeled dashed box containing its app + its own DB/Redis (true isolation).
- **Edges:** `Интернет→nginx`, `nginx→each network` (from nginx routing), intra-network app↔data (implied by membership), `app→OmniRoute` and `OmniRoute→external` (LLM path), `Guacamole→VM` (VNC), `Netdata→…` (monitoring, dashed). Animated dashes convey live traffic.
- **Interaction:** click a node → detail (metrics/logs/open); apps/VM open the embedded viewer.

## 5. Data sources — the topology is parsed from real infra (key section)

| Element | Source | Auto |
|---|---|---|
| Containers: status, uptime, restarts, image, ports | **Docker API** (dockerode — already used for `docker_pulse`) | ✅ |
| **Grouping by Docker network** + membership | Docker API (`listNetworks`, container `NetworkSettings.Networks`) | ✅ |
| Live host CPU/RAM/Disk/Net + per-container stats | **Netdata** + docker stats (already used) | ✅ |
| Public **URLs** + gateway edges (`nginx→service`) | parse **nginx** config (`server_name` → `proxy_pass`) | ✅ |
| **VM** node + open + reachability | **Guacamole** connections (its DB/API) + TCP reachability check | ✅ |
| Human **purpose / tech badge / group display name / explicit deps** | **Docker labels** (`dashboard.purpose`, `dashboard.tech`, `dashboard.group`, `dashboard.depends`) — fall back to image name if absent | semi |
| VM internal CPU/RAM | hypervisor (Proxmox/libvirt) — **deferred** | ⏳ |

**Principle:** the graph is *discovered*, not hand-drawn. Containers/networks/metrics come for free; URLs and gateway edges from nginx; VMs from Guacamole; only the human captions need minimal Docker labels (or auto-fallback).

## 6. API & data model

- **`GET /api/infra/topology`** (new, or extend `/api/metrics/server`): returns
  ```jsonc
  {
    "host": { "name", "uptime", "cpu", "ram", "disk", "net", "vcpu", "ram_total", "os", "containers": {"total","running"} },
    "telemetry": { "cpu": [...], "ram": [...], "net": [...] },   // for the live chart
    "networks": [ { "name": "librechat-net",
                    "services": [ { "name","image","tech","purpose","status","uptime","restarts","cpu","mem","url","role" } ] } ],
    "standalone": [ { "name":"nginx","role":"gateway",... }, { "name":"☁ внешние LLM","role":"external" },
                    { "name":"work-vm","role":"vm","via":"guacamole","reachable":true,"open":"<guac-url>" },
                    { "name":"Netdata","role":"monitor" } ],
    "edges": [ { "from":"nginx","to":"librechat-net","type":"http" },
               { "from":"omniroute","to":"external-llm","type":"llm" },
               { "from":"guacamole","to":"work-vm","type":"vnc" }, ... ]
  }
  ```
- Backend assembles this from: dockerode (containers + networks + labels), Netdata (telemetry), an nginx-config reader (URLs + gateway edges), a Guacamole reader (VMs). Guarded by the same auth as other `/api/*`. Degrades gracefully when a source is unavailable.

## 7. Navigation (resolved)

Keep the existing **«Приложения ▾» dropdown / iframe tabs** as a separate quick-access entry point **and** let topology app-nodes open the same embedded viewer («↗ открыть»). The **VM** node opens **Guacamole** to its connection. Two paths to one viewer.

## 8. Visual system & frontend modules

Reuse the design system + `utils/charts.js`. `mock-infrastructure.html` is the markup/visual source of truth. Anticipated modules:
- `components/HostVitals.js` — node card + compact vitals.
- `components/LiveTelemetry.js` — the big live chart.
- `components/StackTopology.js` — pure builder for the graph (network boxes + standalone nodes + SVG edges) from the `/api/infra/topology` payload; absolute-positioned nodes + an SVG edge layer; CSS pulse/flow animations.
- `main.js` — wire into the Infrastructure tab; lazy-render on first open (existing pattern).

## 9. Demo-proofing

The demo backend stubs `/api/infra/topology` with a representative stack so the tab renders offline as a live cockpit. A subtle client-side jitter on the live values may be used in demo to keep it "alive" without a backend.

## 10. Out of scope / deferred

- VM internal metrics (needs a Proxmox/libvirt source) — VM shown as a reachable node + open-via-Guacamole only.
- Editing/controlling infra from the dashboard (start/stop/restart) — read-only cockpit for now.
- Auto-layout of the graph — v1 uses a curated layered layout (gateway → networks → external), not a physics/auto-layout engine.

## 11. Open questions (resolve during planning)

- nginx config location & parsing strategy (single file vs sites-enabled; how to map `proxy_pass` host:port → container).
- Guacamole access: read its Postgres directly vs its REST API (token).
- Docker label schema finalization (`dashboard.*` keys) + fallbacks when labels are absent.
- Topology node layout: fully curated coordinates vs a light layered auto-placement.
