import { App, Modal, Notice, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	DEFAULT_STORAGE_CONFIG,
	Habit,
	HabitatorSettings,
	HabitatorSettingTab,
	HabitatorStorageConfig,
	HabitatorStorageMode,
} from "./settings";

export default class HabitatorPlugin extends Plugin {
	settings: HabitatorSettings;
	storageConfig: HabitatorStorageConfig = DEFAULT_STORAGE_CONFIG;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("checkmark", "Open Habitator", () => {
			this.openHabitTracker();
		});

		this.addCommand({
			id: "open-habitator-tracker",
			name: "Open Habitator tracker",
			callback: () => this.openHabitTracker(),
		});

		this.addSettingTab(new HabitatorSettingTab(this.app, this));
	}

	onunload() {
		// nothing to clean up
	}

	openHabitTracker() {
		const modal = new HabitatorModal(this.app, this);
		modal.open();
	}

	getHabits(): Habit[] {
		return this.settings.habits;
	}

	getActiveHabit(): Habit | null {
		const habits = this.getHabits();
		if (!habits.length) {
			return null;
		}

		const byId = this.settings.activeHabitId
			? habits.find((h) => h.id === this.settings.activeHabitId)
			: undefined;

		return byId ?? habits[0] ?? null;
	}

	addHabit() {
		const id = generateUuid();
		const habit: Habit = {
			id,
			name: `Habit ${this.settings.habits.length + 1}`,
			completedDays: [],
		};

		this.settings.habits.push(habit);
		if (!this.settings.activeHabitId) {
			this.settings.activeHabitId = id;
		}
	}

	removeHabit(id: string) {
		const index = this.settings.habits.findIndex((h) => h.id === id);
		if (index === -1) return;

		this.settings.habits.splice(index, 1);

		if (this.settings.activeHabitId === id) {
			this.settings.activeHabitId = this.settings.habits[0]?.id ?? null;
		}
	}

	isDayCompleted(dateIso: string): boolean {
		const habit = this.getActiveHabit();
		if (!habit) return false;
		return habit.completedDays.includes(dateIso);
	}

	async setDayCompleted(dateIso: string, completed: boolean) {
		const habit = this.getActiveHabit();
		if (!habit) return;

		const index = habit.completedDays.indexOf(dateIso);

		if (completed && index === -1) {
			habit.completedDays.push(dateIso);
		} else if (!completed && index >= 0) {
			habit.completedDays.splice(index, 1);
		}

		await this.saveSettings();
	}

	refreshOpenModals() {
		// Called from settings after reset; any open modal will re-render on next open.
		// Kept for potential future use if we track open modals.
	}

	async loadSettings() {
		// 1) Always load storage config from plugin storage (so we know where to load habit data from).
		const pluginBlob = (await this.loadData()) as unknown as
			| {
					config?: HabitatorStorageConfig;
					data?: Partial<HabitatorSettings> & { completedDays?: string[] };
			  }
			| (Partial<HabitatorSettings> & { completedDays?: string[] })
			| null;

		this.storageConfig = normalizeStorageConfig((pluginBlob as any)?.config);

		// 2) Load habit data from the selected location.
		const dataFromSelected = await this.tryLoadHabitDataFromConfiguredLocation(pluginBlob);
		if (dataFromSelected) {
			this.settings = normalizeSettings(dataFromSelected);
			return;
		}

		// 3) Migration fallback: try the other known locations in priority order.
		const migrated =
			(await this.tryLoadFromVaultFile(".habitator/habitator.json")) ??
			((pluginBlob as any)?.data ?? (pluginBlob ?? {}));

		this.settings = normalizeSettings(migrated ?? {});

		// 4) Persist to the selected location so future loads are fast and consistent.
		await this.saveSettings();
	}

	async saveSettings() {
		// Persist config in plugin storage always.
		await this.saveData({
			config: this.storageConfig,
			...(this.storageConfig.storageMode === "plugin" ? { data: this.settings } : {}),
		});

		if (this.storageConfig.storageMode === "plugin") {
			return;
		}

		const path = getConfiguredHabitatorDataPath(this.storageConfig);
		const saved = await this.trySaveToVaultFile(path, this.settings);

		// If we can't write to the vault (e.g. mobile adapter restrictions),
		// fall back to default Obsidian plugin storage by embedding data there.
		if (!saved) {
			this.storageConfig = { ...this.storageConfig, storageMode: "plugin" };
			await this.saveData({ config: this.storageConfig, data: this.settings });
		}
	}

	async setStorageConfig(next: HabitatorStorageConfig) {
		const normalized = normalizeStorageConfig(next);
		const prev = this.storageConfig;

		// If nothing changed, do nothing.
		if (prev.storageMode === normalized.storageMode && prev.customSubdir === normalized.customSubdir) return;

		// Write current data to the new location first (best effort), so switching feels seamless.
		if (normalized.storageMode === "plugin") {
			await this.saveData({ config: normalized, data: this.settings });
		} else {
			const targetPath = getConfiguredHabitatorDataPath(normalized);
			await this.trySaveToVaultFile(targetPath, this.settings);
			await this.saveData({ config: normalized });
		}

		this.storageConfig = normalized;
	}

	private async tryLoadHabitDataFromConfiguredLocation(
		pluginBlob: unknown,
	): Promise<(Partial<HabitatorSettings> & { completedDays?: string[] }) | null> {
		if (this.storageConfig.storageMode === "plugin") {
			const obj = pluginBlob as any;
			return (obj?.data ?? obj) ?? null;
		}

		const path = getConfiguredHabitatorDataPath(this.storageConfig);
		return await this.tryLoadFromVaultFile(path);
	}

	private async tryLoadFromVaultFile(path: string): Promise<Partial<HabitatorSettings> | null> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const adapter: any = this.app.vault.adapter as any;
			const exists = await adapter.exists(path);
			if (!exists) return null;

			const raw = await adapter.read(path);
			const parsed = JSON.parse(raw) as Partial<HabitatorSettings>;
			return parsed ?? null;
		} catch {
			return null;
		}
	}

	private async trySaveToVaultFile(path: string, settings: HabitatorSettings): Promise<boolean> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const adapter: any = this.app.vault.adapter as any;
			const dir = getDirName(path);
			if (dir) {
				const dirExists = await adapter.exists(dir);
				if (!dirExists) {
					await adapter.mkdir(dir);
				}
			}

			await adapter.write(path, JSON.stringify(settings, null, 2));
			return true;
		} catch {
			return false;
		}
	}
}

class HabitatorModal extends Modal {
	private plugin: HabitatorPlugin;

	constructor(app: App, plugin: HabitatorPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const habits = this.plugin.getHabits();
		const activeHabit = this.plugin.getActiveHabit();

		if (!habits.length || !activeHabit) {
			contentEl.createEl("p", {
				text: "No habits configured. Please add a habit in the Habitator settings.",
			});
			return;
		}

		const year = this.plugin.settings.year;

		contentEl.addClass("habitator-modal");

		contentEl.createEl("h2", { text: `Habitator – ${year}` });

		const habitTabs = contentEl.createDiv({ cls: "habitator-habit-tabs" });
		for (const habit of habits) {
			const tab = habitTabs.createEl("button", { cls: "habitator-habit-tab" });
			tab.textContent = habit.name || "Habit";

			if (habit.id === activeHabit.id) {
				tab.addClass("is-active");
			}

			tab.addEventListener("click", async () => {
				this.plugin.settings.activeHabitId = habit.id;
				await this.plugin.saveSettings();
				this.onOpen();
			});
		}

		const subtitle = contentEl.createEl("div", { cls: "habitator-subtitle" });
		subtitle.setText("Tap to mark the active habit as done, long press to clear. 365 buttons for the year.");

		const grid = contentEl.createDiv({ cls: "habitator-grid" });

		const today = new Date();
		const todayIso = toIsoDate(today);

		const startDate = new Date(year, 0, 1); // Jan 1

		for (let i = 0; i < 365; i++) {
			const current = new Date(startDate);
			current.setDate(startDate.getDate() + i);
			const iso = toIsoDate(current);

			const btn = grid.createEl("button", {
				cls: "habitator-day-button",
			});

			btn.textContent = formatDayLabel(current, i);

			if (this.plugin.isDayCompleted(iso)) {
				btn.addClass("is-completed");
			}

			if (iso === todayIso) {
				btn.addClass("is-today");
			}

			let pressTimer: number | null = null;
			let longPress = false;

			const clearTimer = () => {
				if (pressTimer !== null) {
					window.clearTimeout(pressTimer);
					pressTimer = null;
				}
			};

			btn.addEventListener("pointerdown", () => {
				longPress = false;
				clearTimer();

				pressTimer = window.setTimeout(async () => {
					longPress = true;
					await this.plugin.setDayCompleted(iso, false);
					btn.toggleClass("is-completed", false);
					new Notice(`Day ${btn.textContent ?? ""} cleared`, 1500);
				}, 600);
			});

			btn.addEventListener("pointerup", async () => {
				// If timer was cleared or long press already handled, do nothing.
				if (pressTimer === null || longPress) {
					clearTimer();
					return;
				}

				clearTimer();

				await this.plugin.setDayCompleted(iso, true);
				btn.toggleClass("is-completed", true);
				new Notice(`Day ${btn.textContent ?? ""} completed`, 1500);
			});

			btn.addEventListener("pointerleave", () => {
				// Leaving the button cancels the pending action if not yet triggered.
				if (!longPress) {
					clearTimer();
				}
			});
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

function generateUuid(): string {
	// Obsidian runs in an Electron/Chromium environment where crypto.randomUUID() exists.
	// Fallback included for environments that don't support it.
	const cryptoObj = (globalThis as unknown as { crypto?: Crypto }).crypto;
	if (cryptoObj?.randomUUID) {
		return cryptoObj.randomUUID();
	}

	// RFC4122-ish v4 fallback (not cryptographically strong, but good enough for IDs).
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = Math.floor(Math.random() * 16);
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

function getHabitatorDataPath(): string {
	// Vault-relative path.
	return ".habitator/habitator.json";
}

function getConfiguredHabitatorDataPath(config: HabitatorStorageConfig): string {
	if (config.storageMode === "dot-habitator") return ".habitator/habitator.json";
	if (config.storageMode === "custom-subdir") {
		const dir = sanitizeVaultRelativeDir(config.customSubdir);
		return `${dir}/habitator.json`;
	}
	// plugin storage (saveData) doesn't use a vault path.
	return ".habitator/habitator.json";
}

function normalizeStorageConfig(input: Partial<HabitatorStorageConfig> | null | undefined): HabitatorStorageConfig {
	const mode = input?.storageMode ?? DEFAULT_STORAGE_CONFIG.storageMode;
	const customSubdir = input?.customSubdir ?? DEFAULT_STORAGE_CONFIG.customSubdir;

	const normalizedMode: HabitatorStorageMode =
		mode === "plugin" || mode === "dot-habitator" || mode === "custom-subdir" ? mode : DEFAULT_STORAGE_CONFIG.storageMode;

	return {
		storageMode: normalizedMode,
		customSubdir: sanitizeVaultRelativeDir(customSubdir),
	};
}

function sanitizeVaultRelativeDir(value: string): string {
	const trimmed = (value ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
	if (!trimmed) return DEFAULT_STORAGE_CONFIG.customSubdir;
	if (trimmed.includes("..")) return DEFAULT_STORAGE_CONFIG.customSubdir;
	return trimmed;
}

function getDirName(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const idx = normalized.lastIndexOf("/");
	if (idx <= 0) return "";
	return normalized.slice(0, idx);
}

function normalizeSettings(input: Partial<HabitatorSettings> & { completedDays?: string[] }): HabitatorSettings {
	const base = Object.assign({}, DEFAULT_SETTINGS, input ?? {});

	// Migration from old single-habit format with top-level completedDays.
	if ((!base.habits || base.habits.length === 0) && input?.completedDays) {
		const migratedHabit: Habit = {
			id: DEFAULT_SETTINGS.habits[0]?.id ?? generateUuid(),
			name: "Main habit",
			completedDays: Array.isArray(input.completedDays) ? input.completedDays : [],
		};
		base.habits = [migratedHabit];
		base.activeHabitId = migratedHabit.id;
	}

	if (!base.habits || base.habits.length === 0) {
		base.habits = [...DEFAULT_SETTINGS.habits];
	}
	if (!base.activeHabitId && base.habits[0]) {
		base.activeHabitId = base.habits[0].id;
	}

	// Ensure every habit has a UUID-ish id.
	for (const habit of base.habits) {
		if (!habit.id) habit.id = generateUuid();
		if (!habit.name) habit.name = "Habit";
		if (!Array.isArray(habit.completedDays)) habit.completedDays = [];
	}

	return base;
}

function toIsoDate(date: Date): string {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function formatDayLabel(date: Date, index: number): string {
	// e.g. "Jan 1" or "D1"
	const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const month = monthNames[date.getMonth()];
	const day = date.getDate();
	return `${month} ${day}`;
}

