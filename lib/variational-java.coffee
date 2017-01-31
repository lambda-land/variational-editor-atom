
# `import CcIdeView from './cc-ide-view';`
# `import { CompositeDisposable } from 'atom';`
# `import Shell from "./console-command"`

{CompositeDisposable} = require 'atom'
VariationalJavaView = require './variational-java-veiw.coffee'
CCInterface = require './cc-interface.coffee'
ui = require './UI/renderTools.coffee'
FoldRender = require './UI/FoldRender.coffee'
ColorRender = require './UI/ColorRender.coffee'
cc = require './TextEditor/JSONConstructor.coffee'
CCModel = require './TextEditor/CCModel.coffee'
DimVeiw = require './UI/DimVeiw.coffee'

module.exports = vjava =
	ccIdeView: null
	modalPanel: null
	subscriptions: null
	toggleSubscriptions:null
	toggleOn:false
	foldRender:null
	colorRender:null
	activate: (state) ->
		@ccIdeView = new DimVeiw();
		# @modalPanel = atom.workspace.addTopPanel({
		# 	item: @ccIdeView.getElement(),
		# 	visible: false,
		# });


		# Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
		@subscriptions = new CompositeDisposable();
		@toggleSubscriptions = new CompositeDisposable();
		# Register command that toggles this view
		@subscriptions.add(atom.commands.add('atom-workspace', {
			'variational-java:toggle': => @toggle()
		}));


	deactivate: ->
		@modalPanel.destroy();
		@subscriptions.dispose();
		@ccIdeView.destroy();
		@foldRender.derenderFolds()
		@colorRender.derenderColor();


	serialize: ->
		return {
			ccIdeViewState: @ccIdeView.serialize()
		};


	renderEvent: (data) =>
		@foldRender.foldChoices(data);
		@colorRender.renderColor(data);

	toggle: ->
		if !@toggleOn
			editor = atom.workspace.getActiveTextEditor();

			text = editor.getText();

			parser = new CCInterface();
			parser.parseVJava(text, (data) =>
				view = new DimVeiw(null, editor);
				view.setModel(new CCModel(data));
				@modalPanel = atom.workspace.addTopPanel({
		 			item: view.getElement(),
		 			visible: true,
		 		});
			)
			@toggleOn = true
		else
			@modalPanel.hide()
			@modalPanel.destroy()
			@toggleOn = false;
					# @foldRender.foldChoices(data);
					# @colorRender.renderColor(data);


		# 	@toggleSubscriptions.add(editor.onDidStopChanging =>
		# 		text = atom.workspace.getActiveTextEditor().getText();
		# 		parser = new CCInterface();
		#
		# 		parser.parseVJava(text, (data) =>
		# 			@foldRender.foldChoices(data);
		# 			@colorRender.renderColor(data);
		#
		# 			)
		# 	)
		# 	@toggleOn = true;
		# else
		# 	@foldRender.derenderFolds()
		# 	@colorRender.derenderColor();
		# 	@toggleSubscriptions.dispose();
		# 	@toggleOn = false;
		#
		# command = new ConsoleCommand();
		# command.runCommand("dir", [], {}, (error, stderr, stdout) ->
		# 	console.log("Output " + stdout)
		# 	console.log("StdErr " + stderr)
	# 	);
		# return (
		#   this.modalPanel.isVisible() ?
		#   this.modalPanel.hide() :
		#   this.modalPanel.show()
		# );
