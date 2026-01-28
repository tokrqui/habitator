import { App, PluginSettingTab, Setting } from "obsidian";
import HabitatorPlugin from "./main";

export interface Habit {
	id: string;
	name: string;
	completedDays: string[]; // ISO date strings: YYYY-MM-DD
}

export interface HabitatorSettings {
	year: number;
	habits: Habit[];
	activeHabitId: string | null;
}

export type HabitatorStorageMode = "plugin" | "dot-habitator" | "custom-subdir";

export interface HabitatorStorageConfig {
	storageMode: HabitatorStorageMode;
	customSubdir: string; // vault-relative directory (no leading slash), used when mode === "custom-subdir"
}

export const DEFAULT_SETTINGS: HabitatorSettings = {
	year: new Date().getFullYear(),
	habits: [
		{
			id: "00000000-0000-4000-8000-000000000001",
			name: "Main habit",
			completedDays: [],
		},
	],
	activeHabitId: "00000000-0000-4000-8000-000000000001",
};

export const DEFAULT_STORAGE_CONFIG: HabitatorStorageConfig = {
	storageMode: "dot-habitator",
	customSubdir: "habitator-data",
};

export class HabitatorSettingTab extends PluginSettingTab {
	plugin: HabitatorPlugin;

	constructor(app: App, plugin: HabitatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Habitator Settings" });

		containerEl.createEl("h3", { text: "Storage" });

		new Setting(containerEl)
			.setName("Where to store data")
			.setDesc("Choose where Habitator saves its JSON data.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("plugin", "Plugin storage (.obsidian/plugins/habitator/data.json)")
					.addOption("dot-habitator", "Vault folder (/.habitator/habitator.json)")
					.addOption("custom-subdir", "Custom vault subfolder (<subdir>/habitator.json)")
					.setValue(this.plugin.storageConfig.storageMode)
					.onChange(async (value) => {
						const mode = value as HabitatorStorageMode;
						await this.plugin.setStorageConfig({
							storageMode: mode,
							customSubdir: this.plugin.storageConfig.customSubdir,
						});
						this.display();
					});
			});

		if (this.plugin.storageConfig.storageMode === "custom-subdir") {
			new Setting(containerEl)
				.setName("Custom subfolder")
				.setDesc("Vault-relative folder name, e.g. '.habitator' or 'data/habits'.")
				.addText((text) => {
					text
						.setPlaceholder("habitator-data")
						.setValue(this.plugin.storageConfig.customSubdir)
						.onChange(async (value) => {
							await this.plugin.setStorageConfig({
								storageMode: "custom-subdir",
								customSubdir: value,
							});
						});
				});
		}

		new Setting(containerEl)
			.setName("Year")
			.setDesc("The year for which to show the 365-day habit tracker.")
			.addText((text) =>
				text
					.setPlaceholder("2026")
					.setValue(this.plugin.settings.year.toString())
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (!Number.isNaN(parsed) && parsed > 1900 && parsed < 3000) {
							this.plugin.settings.year = parsed;
							await this.plugin.saveSettings();
							this.plugin.refreshOpenModals();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Reset all progress")
			.setDesc("Clear all completed days for all habits in the selected year.")
			.addButton((button) =>
				button
					.setButtonText("Reset")
					.setWarning()
					.onClick(async () => {
						for (const habit of this.plugin.settings.habits) {
							habit.completedDays = [];
						}
						await this.plugin.saveSettings();
						this.plugin.refreshOpenModals();
					}),
			);

		containerEl.createEl("h3", { text: "Habits" });

		for (const habit of this.plugin.settings.habits) {
			const setting = new Setting(containerEl)
				.setName(habit.name || "Habit")
				.setDesc("Each habit has its own 365-day tracker.")
				.addText((text) => {
					text
						.setPlaceholder("Habit name")
						.setValue(habit.name)
						.onChange(async (value) => {
							habit.name = value || "Habit";
							// Update the label immediately without re-rendering the whole tab.
							setting.setName(habit.name);
							await this.plugin.saveSettings();
							this.plugin.refreshOpenModals();
							// Do not call this.display() here, it causes the input to lose focus
							// while user is typing. The name label will update on next open.
						});
				});

			setting.addExtraButton((button) =>
				button
					.setIcon("checkmark")
					.setTooltip("Set as active habit in tracker")
					.onClick(async () => {
						this.plugin.settings.activeHabitId = habit.id;
						await this.plugin.saveSettings();
						this.plugin.refreshOpenModals();
						this.display();
					}),
			);

			if (this.plugin.settings.habits.length > 1) {
				setting.addExtraButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("Delete this habit")
						.onClick(async () => {
							this.plugin.removeHabit(habit.id);
							await this.plugin.saveSettings();
							this.plugin.refreshOpenModals();
							this.display();
						}),
				);
			}
		}

		new Setting(containerEl)
			.addButton((button) =>
				button
					.setButtonText("Add habit")
					.setCta()
					.onClick(async () => {
						this.plugin.addHabit();
						await this.plugin.saveSettings();
						this.plugin.refreshOpenModals();
						this.display();
					}),
			);
	}
}

