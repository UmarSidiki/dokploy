# Dokploy Remote Server Monitoring Fix Guide

This guide details how to ungate remote server monitoring on self-hosted Dokploy. By default, CPU/RAM/disk/network monitoring for remote servers is cloud-only (`IS_CLOUD` / `isCloud`). The backend APIs and `dokploy/monitoring` agent already work on self-hosted — only the UI and auto-setup during Setup Server were gated.

After these changes you get the same remote monitoring as Dokploy Cloud: server metrics (CPU, RAM, disk, network), container metrics, threshold alerts, and auto-install of `dokploy/monitoring` when setting up a remote server.

---

## Background

Dokploy has **two** monitoring stacks:

| Stack | Used for | How it works |
|---|---|---|
| **Free** | Self-hosted **native** Dokploy host only | WebSocket + `docker stats` / `node-os-utils` on the panel machine |
| **Paid / agent** (`dokploy/monitoring`) | **Remote servers** | Go container on each remote, exposes `/metrics` (default port **4500**) |

Remote servers **cannot** use free monitoring — that only sees Docker on the Dokploy host. Remotes need the `dokploy/monitoring` agent.

**Resource controlling** (CPU/RAM limits in Advanced → Resources) is separate and was never cloud-gated.

### What was gated (before this fix)

| Capability | Self-hosted UI | Backend |
|---|---|---|
| Deploy agent on remote | Hidden | Worked (`server.setupMonitoring`) |
| Remote CPU/RAM/disk charts | Hidden | Worked (`getServerMetrics`) |
| Remote container metrics | Hidden | Worked |
| Auto-deploy agent on Setup Server | Skipped (`if (IS_CLOUD)`) | Gated |
| Service Monitoring tabs for remotes | Hidden | Worked |

Enterprise license does **not** unlock remote monitoring — the gate is purely `isCloud` / `IS_CLOUD`.

---

## Code Modifications Overview

Modifications are made across these areas:

1. Auto-install monitoring during remote Setup Server
2. Show Monitoring tab in Setup Server dialog
3. Show Monitoring charts button on Servers list
4. Ungate Monitoring tabs + paid agent UI on all service pages

---

### 1. `packages/server/src/setup/server-setup.ts`

**Location:** `packages/server/src/setup/server-setup.ts`

**Action:** Remove the `IS_CLOUD` gate so Setup Server auto-configures a metrics token/callback and deploys `dokploy/monitoring` on deploy remotes (skip build servers). Also remove unused `IS_CLOUD` from the import.

**Import change:**

```typescript
// Before
import { IS_CLOUD, paths } from "@dokploy/server/constants";

// After
import { paths } from "@dokploy/server/constants";
```

**Setup block — replace `if (IS_CLOUD)` with `if (!isBuildServer)`:**

```typescript
await installRequirements(serverId, onData);

if (!isBuildServer) {
	onData?.("\nConfiguring Monitoring: 🔄\n");

	const baseUrl = await getDokployUrl();
	const token = generateToken();
	const urlCallback = `${baseUrl}/api/trpc/notification.receiveNotification`;

	// Update server with monitoring configuration
	await updateServerById(serverId, {
		metricsConfig: {
			server: {
				...server.metricsConfig.server,
				token: token,
				urlCallback: urlCallback,
			},
			containers: server.metricsConfig.containers,
		},
	});

	await setupMonitoring(serverId);
	onData?.("\nMonitoring Configured: ✅\n");
}
```

This pulls/runs the `dokploy/monitoring` image on the remote via SSH/Docker (see `packages/server/src/setup/monitoring-setup.ts`).

---

### 2. `apps/dokploy/components/dashboard/settings/servers/setup-server.tsx`

**Location:** `apps/dokploy/components/dashboard/settings/servers/setup-server.tsx`

**Action:** Always show the Monitoring tab for non-build servers. Remove the unused `isCloud` query. Use `grid-cols-6` whenever Monitoring is shown.

**Remove:**

```typescript
const { data: isCloud } = api.settings.isCloud.useQuery();
```

**Tabs list — replace the cloud-gated version with:**

```tsx
<TabsList
	className={cn(
		"grid  w-[700px]",
		isBuildServer ? "grid-cols-3" : "grid-cols-6",
	)}
>
	<TabsTrigger value="ssh-keys">SSH Keys</TabsTrigger>
	<TabsTrigger value="deployments">Deployments</TabsTrigger>
	<TabsTrigger value="validate">Validate</TabsTrigger>

	{!isBuildServer && (
		<>
			<TabsTrigger value="audit">Security</TabsTrigger>
			<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
			<TabsTrigger value="gpu-setup">GPU Setup</TabsTrigger>
		</>
	)}
</TabsList>
```

The `TabsContent value="monitoring"` with `<SetupMonitoring serverId={serverId} />` already exists — only the trigger was gated.

---

### 3. `apps/dokploy/components/dashboard/settings/servers/show-servers.tsx`

**Location:** `apps/dokploy/components/dashboard/settings/servers/show-servers.tsx`

**Action:** Show the Monitoring charts modal button without `isCloud`. Keep `sshKeyId` and non-build guards.

**Before:**

```tsx
{isCloud &&
	server.sshKeyId &&
	!isBuildServer && (
		// ShowMonitoringModal ...
	)}
```

**After:**

```tsx
{server.sshKeyId &&
	!isBuildServer && (
		<Tooltip>
			<TooltipTrigger asChild>
				<div>
					<ShowMonitoringModal
						url={`http://${server.ipAddress}:${server?.metricsConfig?.server?.port}/metrics`}
						token={server?.metricsConfig?.server?.token}
					/>
				</div>
			</TooltipTrigger>
			<TooltipContent>
				<p>Monitoring</p>
			</TooltipContent>
		</Tooltip>
	)}
```

---

### 4. Service pages — Monitoring tab + paid agent UI

Apply the same pattern on **all** of these files:

| File |
|---|
| `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/application/[applicationId].tsx` |
| `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/compose/[composeId].tsx` |
| `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/postgres/[postgresId].tsx` |
| `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/mysql/[mysqlId].tsx` |
| `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/redis/[redisId].tsx` |
| `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/mongo/[mongoId].tsx` |
| `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/mariadb/[mariadbId].tsx` |
| `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/libsql/[libsqlId].tsx` |

#### A. Monitoring tab trigger

**Before:**

```tsx
{permissions?.monitoring.read &&
	((data?.serverId && isCloud) || !data?.server) && (
		<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
	)}
```

**After:**

```tsx
{permissions?.monitoring.read && (
	<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
)}
```

For `libsql` (no permission check on that tab originally):

```tsx
{((data?.serverId && isCloud) || !data?.server) && (
	<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
)}
```

→ always show:

```tsx
<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
```

#### B. Monitoring content — use paid agent when service is on a remote

**Before:**

```tsx
{data?.serverId && isCloud ? (
	<ContainerPaidMonitoring ... />
) : (
	<ContainerFreeMonitoring ... />
)}
```

**After:**

```tsx
{data?.serverId ? (
	<ContainerPaidMonitoring ... />
) : (
	<ContainerFreeMonitoring ... />
)}
```

For **compose**, same idea with `ComposePaidMonitoring` / `ComposeFreeMonitoring`:

```tsx
{data?.serverId ? (
	<ComposePaidMonitoring ... />
) : (
	<ComposeFreeMonitoring ... />
)}
```

#### C. Tab grid columns (database pages)

On postgres / mysql / redis / mongo / mariadb / libsql, the `TabsList` used fewer columns for remotes when Monitoring was hidden. After ungating, always use the full column count:

```tsx
// Before (example)
isCloud && data?.serverId
	? "md:grid-cols-6"
	: data?.serverId
		? "md:grid-cols-5"
		: "md:grid-cols-6"

// After
"md:grid-cols-6"
```

For **redis** (5 tabs when monitoring shown):

```tsx
"md:grid-cols-5"
```

#### D. Cleanup

Remove unused queries/prefetches from these pages:

```typescript
const { data: isCloud } = api.settings.isCloud.useQuery();
```

```typescript
await helpers.settings.isCloud.prefetch();
```

---

## What you get once enabled

From the `dokploy/monitoring` Go agent (`apps/monitoring/`):

### Server metrics
- CPU usage (%), model, cores
- Memory usage
- Disk
- Network
- Uptime, OS, kernel, architecture

### Container metrics
- CPU, memory, network, block I/O
- Include / exclude service filters

### Alerts
- CPU / memory thresholds via callback URL → Dokploy notifications

### Defaults
- Port: **4500**
- Image: `dokploy/monitoring:latest` (or `:canary` on self-hosted canary/dev)
- Host network mode on remotes
- Mounts: docker.sock, `/proc`, `/sys`, SQLite DB under `/etc/dokploy/monitoring/`

---

## Operational steps (after rebuild)

1. Rebuild and redeploy your custom Dokploy image (see below).
2. For **existing** remotes: open the server → **Setup Server** → run setup again, **or** open the **Monitoring** tab → configure → Save (deploys/restarts the agent).
3. Ensure the Dokploy panel can reach `http://<remote-ip>:4500/metrics` (open port **4500** on the remote firewall / security group).
4. Use the Monitoring button on the Servers list, or the Monitoring tab on each remote service.

### Manual API workaround (without UI)

Call `server.setupMonitoring` via tRPC with a full `metricsConfig`, then hit:

```text
GET http://<remote-ip>:4500/metrics
Authorization: Bearer <token>
```

---

## Manual Update & Build Instructions

To apply these changes on your VPS, run the following commands:

```bash
cd ~
git clone https://github.com/UmarSidiki/dokploy.git dokploy-custom
cd dokploy-custom

touch .env.production

# Build the custom Docker image
sudo docker build -t dokploy-custom:latest -f Dockerfile .

# Update the running Dokploy Swarm service
sudo docker service update --image dokploy-custom:latest dokploy

# Reboot VPS to apply all updates cleanly
sudo reboot
```

After reboot, re-run **Setup Server** on each remote so `dokploy-monitoring` is installed, then open port **4500** if charts do not load.
