import {
	App,
	ButtonComponent,
	Editor,
	EditorPosition,
	ExtraButtonComponent,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	SuggestModal,
	TextComponent,
	TFile,
	ToggleComponent,
	Vault
} from "obsidian";

export default class WriterAssist extends Plugin {
	public settings: WriterAssistSettings;

	public override async onload() {
		console.log("loading writer assist plugin...");
		await this.loadSettings();

		this.addSettingTab(new MyPluginSettingTab(this.app, this));

		this.addCommand({
			id: "editor-add-section-wikilink",
			name: "Add section wikilink",
			editorCallback: this.addSectionWikilink.bind(this)
		});

		this.addCommand({
			id: "editor-add-character-reference",
			name: "Add character reference",
			editorCallback: this.addCharacterReference.bind(this)
		});

		this.addCommand({
			id: "editor-add-character-diag",
			name: "Add character dialog block",
			editorCallback: this.addCharacterDiag.bind(this)
		});

		this.addCommand({
			id: "editor-add-dramatic-ellipsis",
			name: "Add dramatic ellipsis",
			editorCallback: this.addDramaticEllipsis.bind(this)
		});
	}

	private async addDramaticEllipsis(editor: Editor, view: MarkdownView) {
		const html = '<span class="center-align">(…)</span>';
		editor.replaceRange(html, editor.getCursor());

		editor.focus();
		const editorPos: EditorPosition = editor.getCursor();
		editor.setCursor({
			line: editorPos.line,
			ch: editorPos.ch + html.length
		});
	}

	private async addCharacterDiag(editor: Editor, view: MarkdownView) {
		const targetNote: TFile | null = await promptForCharacter(this.settings.characterPools);

		if (!targetNote)
			return;

		const alias: string | null = await promptForAlias(targetNote);
		const shortNotePath = shortenNotePath(targetNote, this.app.vault);

		const link = alias
			? `[[${shortNotePath}|${alias}]]`
			: `[[${shortNotePath}]]`;

		editor.replaceRange(`> <span class="left-align">${link}</span>\n> “”`, editor.getCursor());

		editor.focus();
		const editorPos: EditorPosition = editor.getCursor();
		editor.setCursor({
			line: editorPos.line + 1,
			ch: editorPos.ch - 1
		});
	}

	private async addCharacterReference(editor: Editor, view: MarkdownView) {
		const targetNote: TFile | null = await promptForCharacter(this.settings.characterPools);

		if (!targetNote)
			return;

		const alias: string | null = await promptForAlias(targetNote);
		const shortNotePath = shortenNotePath(targetNote, this.app.vault);

		editor.replaceSelection(
			alias
				? `[[${shortNotePath}|${alias}]]`
				: `[[${shortNotePath}]]`
		);

		editor.focus();
	}

	private async addSectionWikilink(editor: Editor, view: MarkdownView) {
		let targetNote: TFile | null;

		if (this.settings.sectionNotes.length == 0) {
			targetNote = await new NoteSuggestModal(
				this.app,
				"Append to which note?"
			).awaitSelection();
		}
		else {
			const selectedNote: string | null = await new TextSuggestModal(
				this.app,
				this.settings.sectionNotes,
				"Append to which note?"
			).awaitSelection();

			if (!selectedNote) {
				new Notice("No note selected.");
				return;
			}

			targetNote = this.app.vault.getFileByPath(selectedNote);
		}

		if (!targetNote) {
			new Notice("Note not found.");
			return;
		}

		let sectionId: string | null = await new PromptModal(
			this.app,
			"Enter section ID (leave blank for random):"
		).awaitSelection();

		if (sectionId)
			sectionId = sectionId.trim()
				// Convert spaces and underscores to hyphens.
				.replace(/[\s_]+/g, "-")
				// Remove everything else except letters, numbers, and hyphens.
				.replace(/[^a-zA-Z0-9-]/g, "");

		if (!sectionId)
			sectionId = randomSectionId();

		const selection: string = editor.getSelection() || "Replace this";
		const shortNotePath = shortenNotePath(targetNote, this.app.vault);

		const link: string = `[[${shortNotePath}#^${sectionId}|${selection}]]`;
		editor.replaceSelection(link);

		editor.focus();
		const editorPos: EditorPosition = editor.getCursor();
		editor.setSelection(
			{
				line: editorPos.line,
				ch: editorPos.ch - selection.length - 2
			},
			{
				line: editorPos.line,
				ch: editorPos.ch - 2
			}
		);

		this.app.vault.process(targetNote, (content: string): string => {
			if (targetNote != view.file)
				content = content.trimEnd();

			if (!content)
				return `${selection} ^${sectionId}\n`

			return `${content}${this.settings.sectionSeparator}${selection} ^${sectionId}\n`
		});
	}

	public override onunload() {

	}

	private async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	public async saveSettings() {
		await this.saveData(this.settings);
	}
}

async function promptForAlias(charNote: TFile): Promise<string | null> {
	return await new PromptModal(
		this.app,
		"Enter character alias (leave blank for note name):",
		charNote.basename
	).awaitSelection();
}

async function promptForCharacter(pools: CharacterPool[]): Promise<TFile | null> {
	const activeCharNotes: string[] | null = getActiveCharNotes(pools);

	if (activeCharNotes.length == 0) {
		new Notice("No active characters to reference.");
		return null;
	}

	const selectedCharNote: string | null = await new TextSuggestModal(
		this.app,
		activeCharNotes,
		"Which character to reference?"
	).awaitSelection();

	if (!selectedCharNote) {
		new Notice("No character selected.");
		return null;
	}

	const targetNote: TFile | null = this.app.vault.getFileByPath(selectedCharNote);

	if (!targetNote) {
		new Notice("Note not found.");
		return null;
	}

	return targetNote;
}

function shortenNotePath(note: TFile, vault: Vault): string {
	const noteName: string = note.basename;
	const allNotes: TFile[] = vault.getMarkdownFiles();
	let count = 0;

	for (let i = 0; i < allNotes.length; i++) {
		if (allNotes[i].basename == noteName)
			count++;

		if (count > 1)
			return note.path.slice(0, -3);
	}

	return noteName;
}

function randomSectionId(): string {
	return Math.random().toString(36).substring(2, 8);
}

class CharacterPool {
	public constructor(
		public name: string,
		public charNotes: string[],
		public isEnabled: boolean = true
	) { }
}

function getActiveCharNotes(pools: CharacterPool[]): string[] {
	let activeCharCount = 0;

	for (let i = 0; i < pools.length; i++) {
		if (pools[i].isEnabled)
			activeCharCount += pools[i].charNotes.length;
	}

	if (activeCharCount == 0)
		return [];

	const activeCharNotes: string[] = new Array(activeCharCount);
	let index = 0;

	for (let i = 0; i < pools.length; i++) {
		const pool = pools[i];

		if (pool.isEnabled) {
			const charNotes = pool.charNotes;

			for (let j = 0; j < charNotes.length; j++)
				activeCharNotes[index++] = charNotes[j];
		}
	}

	return activeCharNotes;
}

interface WriterAssistSettings {
	sectionNotes: string[];
	sectionSeparator: string;

	characterPools: CharacterPool[];
}

const DEFAULT_SETTINGS: WriterAssistSettings = {
	sectionNotes: ["Test Note"],
	sectionSeparator: "\n\n---\n",

	characterPools: [
		new CharacterPool("Test Pool", ["Test Note"])
	]
}

class ConfirmModal extends Modal {
	private response: boolean;
	private resolve: (response: boolean) => void;

	public constructor(
		app: App,
		private readonly title: string,
		private readonly message: string,
		private readonly yesText: string = "Yes",
		private readonly noText: string = "No"
	) {
		super(app);
	}

	public override onOpen() {
		super.onOpen();
		this.titleEl.setText(this.title);

		this.contentEl.createEl("p", { text: this.message });

		new Setting(this.contentEl)
			.addButton((button: ButtonComponent) =>
				button.setButtonText(this.yesText)
					.setWarning()
					.onClick(() => {
						this.response = true;
						this.close();
					})
			)
			.addButton((button: ButtonComponent) =>
				button.setButtonText(this.noText)
					.setCta()
					.onClick(() => {
						this.response = false;
						this.close();
					})
			);
	}

	public override onClose() {
		super.onClose();
		this.contentEl.empty();
		this.resolve(this.response);
	}

	public async awaitConfirmation(): Promise<boolean> {
		this.open();

		return new Promise((resolve) => {
			this.resolve = resolve;
		});
	}
}

class PromptModal extends Modal {
	private response: string | null;
	private resolve: (response: string | null) => void;

	public constructor(
		app: App,
		private readonly title: string,
		private readonly placeholder: string = "Type response here..."
	) {
		super(app);
	}

	public override onOpen() {
		super.onOpen();
		this.titleEl.setText(this.title);

		const div = this.contentEl.createDiv();
		let textInput = new TextComponent(div);

		textInput.setPlaceholder(this.placeholder);
		textInput.onChange((value) => (this.response = value));
		textInput.inputEl.focus();

		textInput.inputEl.addEventListener("keydown", this.inputCallback.bind(this));
	}

	private inputCallback(event: KeyboardEvent) {
		if (event.isComposing || event.key !== "Enter")
			return;

		event.preventDefault();
		this.close();
	}

	public override onClose() {
		super.onClose();
		this.contentEl.empty();
		this.resolve(this.response);
	}

	public async awaitSelection(): Promise<string | null> {
		this.open();

		return new Promise((resolve) => {
			this.resolve = resolve;
		});
	}
}

class MyPluginSettingTab extends PluginSettingTab {
	public constructor(
		app: App,
		private readonly plugin: WriterAssist
	) {
		super(app, plugin);
	}

	public override display() {
		const { containerEl } = this;
		const settings: WriterAssistSettings = this.plugin.settings;

		containerEl.empty();
		this.displaySectionWikilinks(settings, containerEl);
		this.displayCharacterReferencer(settings, containerEl);
	}

	private displayCharacterReferencer(settings: WriterAssistSettings, containerEl: HTMLElement) {
		containerEl.createEl("h1", { text: "Character Referencer" });

		const pools: CharacterPool[] = settings.characterPools;

		new Setting(containerEl)
			.setName("Character Pools")
			.setDesc("The pools of characters to choose from when prompted to reference.\nThey can be toggled on and off.")
			.addButton((button: ButtonComponent) =>
				button.setIcon("plus")
					.setTooltip("Add Pool")
					.setCta()
					.onClick(async () => {
						const name: string | null = await new PromptModal(
							this.app,
							"Enter pool name:"
						).awaitSelection();

						if (!name)
							return;

						pools.push(new CharacterPool(name, []));
						await this.plugin.saveSettings();

						this.display();
					})
			);

		this.displayCharacterPools(pools, containerEl);
	}

	private displayCharacterPools(pools: CharacterPool[], containerEl: HTMLElement) {
		for (let i = 0; i < pools.length; i++) {
			const pool: CharacterPool = pools[i];

			new Setting(containerEl)
				.setHeading()
				.setName(pool.name)
				.addExtraButton((button: ExtraButtonComponent) =>
					button.setIcon("pencil")
						.setTooltip("Edit Pool")
						.onClick(async () => {
							const newName: string | null = await new PromptModal(
								this.app,
								"Enter the new pool name:",
								pool.name
							).awaitSelection();

							if (!newName)
								return;

							pool.name = newName;
							this.plugin.saveSettings();

							this.display();

						})
				)
				.addButton((button: ButtonComponent) =>
					button.setIcon("plus")
						.setTooltip("Add Character")
						.onClick(async () => {
							const charNote: TFile | null = await new NoteSuggestModal(
								this.app,
								"Search for a character's note..."
							).awaitSelection();

							if (!charNote)
								return;

							pool.charNotes.push(charNote.path);
							this.plugin.saveSettings();

							this.display();
						})
				)
				.addExtraButton((button: ExtraButtonComponent) =>
					button.setIcon("trash")
						.setTooltip("Remove Pool")
						.onClick(async () => {
							const response = await new ConfirmModal(
								this.app,
								"Remove Pool",
								`Are you sure you want to remove the pool "${pool.name}"?`
							).awaitConfirmation();

							if (!response)
								return;

							pools.splice(i, 1);
							this.plugin.saveSettings();

							this.display();
						})
				)
				.addToggle((toggle: ToggleComponent) =>
					toggle.setValue(pool.isEnabled)
						.setTooltip("Enable/Disable Pool")
						.onChange((value) => {
							pool.isEnabled = value;
							this.plugin.saveSettings();
						})
				);

			this.displayPoolCharacters(pool, containerEl);
		}
	}

	private displayPoolCharacters(pool: CharacterPool, containerEl: HTMLElement) {
		const charNotes: string[] = pool.charNotes;

		for (let i = 0; i < charNotes.length; i++) {
			const charNote: string = charNotes[i];

			new Setting(containerEl)
				.setName(charNote)
				.addExtraButton((button: ExtraButtonComponent) =>
					button.setIcon("trash")
						.setTooltip("Remove Character")
						.onClick(() => {
							charNotes.splice(i, 1);
							this.plugin.saveSettings();

							this.display();
						})
				);
		}
	}

	private displaySectionWikilinks(settings: WriterAssistSettings, containerEl: HTMLElement) {
		containerEl.createEl("h1", { text: "Section Wikilinks" });

		new Setting(containerEl)
			.setName("Section separator")
			.setDesc("The separator to prepend between each section.\nTo insert a newline, use \"\\n\".")
			.addText((text) =>
				text.setValue(settings.sectionSeparator.replace(/\n/g, "\\n"))
					.setPlaceholder(DEFAULT_SETTINGS.sectionSeparator.replace(/\n/g, "\\n"))
					.onChange((value) => {
						settings.sectionSeparator = value.replace(/\\n/g, "\n");
						this.plugin.saveSettings();
					})
			);

		const sectionNotes: string[] = settings.sectionNotes;

		new Setting(containerEl)
			.setName("Section notes")
			.setDesc("The notes which can be chosen when prompted to append the sections.\nAdd none to choose from all your notes each time.")
			.addButton((button: ButtonComponent) =>
				button.setIcon("plus")
					.setTooltip("Add Note")
					.setCta()
					.onClick(async () => {
						const note: TFile | null = await new NoteSuggestModal(this.app)
							.awaitSelection();

						if (!note)
							return;

						if (sectionNotes.contains(note.path)) {
							new Notice("Note already added.");
							return;
						}

						new Notice(`Selected note: "${note.path}".`);
						sectionNotes.push(note.path);
						await this.plugin.saveSettings();

						this.display();
					})
			);

		for (let i = 0; i < sectionNotes.length; i++) {
			const note: string = sectionNotes[i];

			new Setting(containerEl)
				.setName(note)
				.addExtraButton((button: ExtraButtonComponent) =>
					button.setIcon("trash")
						.setTooltip("Remove Note")
						.onClick(() => {
							sectionNotes.splice(i, 1);
							this.plugin.saveSettings();

							this.display();
						})
				);
		}
	}
}

abstract class AwaitSuggestModal<T> extends SuggestModal<T> {
	public constructor(
		app: App,
		protected readonly suggestions: T[],
		protected readonly placeholder: string = "Type to search..."
	) {
		super(app);
	}

	public abstract getSuggestions(query: string): T[] | Promise<T[]>;

	public abstract renderSuggestion(text: T, el: HTMLElement): void;

	public override onChooseSuggestion(_item: T) { }

	public override onOpen() {
		super.onOpen();
		this.inputEl.placeholder = this.placeholder;
	}

	public awaitSelection(): Promise<T | null> {
		this.open();

		return new Promise((resolve) => {
			this.onChooseSuggestion = resolve;

			this.onClose = () => {
				window.setTimeout(() => {
					resolve(null);
				}, 0)
			}
		});
	}
}

class TextSuggestModal extends AwaitSuggestModal<string> {
	public constructor(
		app: App,
		suggestions: string[],
		placeholder: string = "Type to search..."
	) {
		super(app, suggestions, placeholder);
	}

	public override getSuggestions(query: string): string[] | Promise<string[]> {
		query = query.toLowerCase();
		const filtered: string[] = [];

		for (let i = 0; i < Math.min(this.suggestions.length, 1000); i++) {
			if (this.suggestions[i].toLowerCase().contains(query))
				filtered.push(this.suggestions[i]);
		}

		return filtered;
	}

	public override renderSuggestion(text: string, el: HTMLElement): void {
		el.setText(text);
	}
}

class NoteSuggestModal extends AwaitSuggestModal<TFile> {
	public constructor(
		app: App,
		placeholder: string = "Type to search for a note..."
	) {
		super(app, app.vault.getMarkdownFiles(), placeholder);
	}

	public override getSuggestions(query: string): TFile[] | Promise<TFile[]> {
		query = query.toLowerCase();
		const filtered: TFile[] = [];

		for (let i = 0; i < Math.min(this.suggestions.length, 1000); i++) {
			if (this.suggestions[i].path.toLowerCase().contains(query))
				filtered.push(this.suggestions[i]);
		}

		return filtered;
	}

	public override renderSuggestion(note: TFile, el: HTMLElement): void {
		el.setText(note.path);
	}
}
