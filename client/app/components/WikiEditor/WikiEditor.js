import React, { Component } from "react";
import {
  Editor,
  EditorState,
  RichUtils,
  Modifier,
  CompositeDecorator,
  convertToRaw,
  convertFromRaw,
  convertFromHTML,
  ContentState
} from "draft-js";

import { changeDepth, getEntityRange } from "draftjs-utils";
import classNames from "classnames";

import Toolbar from "./Toolbar/";
import {
  getEntities,
  convertToEditorState,
  getCurrentEntityKey,
  shouldHidePlaceholder
} from "./helpers/";

import { Link, Image } from "./entities/";

const styleMap = {
  STRIKETHROUGH: {
    textDecoration: "line-through"
  }
};

class WikiEditor extends Component {
  constructor(...args) {
    super(...args);

    // "customize" the getEntities to match entityType
    const getLinkEntities = getEntities("LINK");
    const getImageEntities = getEntities("IMAGE");

    const decorator = new CompositeDecorator([
      {
        strategy: getLinkEntities,
        component: Link
      },
      {
        strategy: getImageEntities,
        component: Image
      }
    ]);

    const { rawContent, isHtml } = this.props;

    this.state = {
      // `convertToEditorState` contains some logic to preserve backward compatibility
      editorState: convertToEditorState(rawContent, isHtml, decorator),
      currentEntityKey: null
    };

    this.handleKeyCommand = command => this._handleKeyCommand(command);
    this.focus = () => this.refs.editor.focus();
    this.onTab = e => this._onTab(e);
    this.onChange = editorState => this._onChange(editorState);

    // to get the rawContent when the Save button in the parent is clicked.
    // invoked via ref
    this.getRawContent = () => this._getRawContent();

    // Handlers for `Toolbar` components.
    // TODO Should this be placed elsewhere? or remove with static class

    // `InlineControls`
    this.toggleInlineStyle = inlineStyle =>
      this._toggleInlineStyle(inlineStyle);

    // `LinkControl`
    this.onAddLink = linkData => this._onAddLink(linkData);
    this.onRemoveLink = () => this._onRemoveLink();

    // `BlockControls`
    this.toggleBlockType = blockType => this._toggleBlockType(blockType);

    // `LevelControls`
    this.toggleLevelType = adjustment => this._toggleLevelType(adjustment);

    // `HistoryControls`
    this.onUndo = () => this._onUndo();
    this.onRedo = () => this._onRedo();
  }

  _getRawContent() {
    // TODO REDUX will remove this from here, in the future!
    const { editorState } = this.state;
    const rawContent = convertToRaw(editorState.getCurrentContent());

    return rawContent;
  }

  _onChange(editorState) {
    this.setState({ editorState });

    // get the currentEntity
    // TODO, again, is inefficient
    this.setState({
      currentEntityKey: getCurrentEntityKey(editorState)
    });
  }

  _onTab(e) {
    const maxDepth = 4;
    this.onChange(RichUtils.onTab(e, this.state.editorState, maxDepth));
  }

  _handleKeyCommand(cmd) {
    const { editorState } = this.state;

    const newState = RichUtils.handleKeyCommand(editorState, cmd);

    if (newState) {
      this.onChange(newState);
      return true;
    }

    return false;
  }

  _toggleInlineStyle(inlineStyle) {
    const { editorState } = this.state;

    this.onChange(RichUtils.toggleInlineStyle(editorState, inlineStyle));
  }

  _onAddLink(url) {
    const { editorState } = this.state;
    const contentState = editorState.getCurrentContent();

    // create the entity. returns a new ContentState object that must be pushed back into the editor
    let contentStateWithEntity = contentState.createEntity("LINK", "MUTABLE", {
      url
    });

    // get the entity key, so that..
    // ..1) if there is no selected range, use the Modifier API (see below) OR....
    // ..2) Now that there is some selected text, RichUtils could be used to toggle selected text with entityKey's type

    const entityKey = contentState.getLastCreatedEntityKey();

    const selection = editorState.getSelection();
    if (selection.isCollapsed()) {
      // insert the URL as entity text
      contentStateWithEntity = Modifier.insertText(
        contentStateWithEntity,
        selection,
        url,
        null,
        entityKey
      );
    }

    //  create a new EditorState
    const editorStateWithEntity = EditorState.set(editorState, {
      currentContent: contentStateWithEntity
    });

    this.onChange(
      RichUtils.toggleLink(
        editorStateWithEntity,
        editorStateWithEntity.getSelection(),
        entityKey
      )
    );

    //  TODO move cursor to after entity text and focus. The code below does this, but creates problems with Link addition. FIX THIS
    //  const editorStateWithSelection = EditorState.moveSelectionToEnd(editorStateWithEntity);
    //  setTimeout(() => this.focus(), 0);
  }

  _onRemoveLink() {
    const { editorState, currentEntityKey } = this.state;

    if (currentEntityKey) {
      let selection = editorState.getSelection();
      const entityRange = getEntityRange(editorState, currentEntityKey);

      selection = selection.merge({
        anchorOffset: entityRange.start,
        focusOffset: entityRange.end
      });

      this.onChange(RichUtils.toggleLink(editorState, selection, null));
    }
  }

  _onAddImage() {
    
  }

  _toggleBlockType(blockType) {
    const newState = RichUtils.toggleBlockType(
      this.state.editorState,
      blockType
    );
    this.onChange(newState);
    setTimeout(() => this.focus(), 0);
  }

  _toggleLevelType(adjustment) {
    // adjustment = 1 for indent
    // adjustment = -1 for outdent
    const newState = changeDepth(this.state.editorState, adjustment, 4);
    this.onChange(newState);
  }

  _onUndo() {
    const { editorState } = this.state;

    const newState = EditorState.undo(editorState);

    if (newState) {
      this.onChange(newState);
      return true;
    }

    return false;
  }

  _onRedo() {
    const { editorState } = this.state;

    const newState = EditorState.redo(editorState);

    if (newState) {
      this.onChange(newState);
      return true;
    }

    return false;
  }

  render() {
    const { editorState, currentEntityKey } = this.state;
    const contentState = editorState.getCurrentContent();
    const currentEntity = currentEntityKey
      ? contentState.getEntity(currentEntityKey)
      : null;

    const editorProps = {
      ref: "editor",
      customStyleMap: styleMap,
      editorState: editorState,
      onChange: this.onChange,
      onTab: this.onTab,
      handleKeyCommand: this.handleKeyCommand,
      placeholder: "Start writing here...."
    };
    const toolbarProps = {
      editorState,
      currentEntity,
      toggleBlockType: this.toggleBlockType,
      toggleInlineStyle: this.toggleInlineStyle,
      onAddLink: this.onAddLink,
      onRemoveLink: this.onRemoveLink,
      toggleLevelType: this.toggleLevelType,
      onUndo: this.onUndo,
      onRedo: this.onRedo
    };

    let ToolbarComponent = <Toolbar {...toolbarProps} />;

    let EditorComponent = <Editor {...editorProps} />;

    if (this.props.readOnly) {
      ToolbarComponent = null;
      EditorComponent = (
        <div className="readonly">
          <Editor readOnly {...editorProps} />
        </div>
      );
    }

    // If the user changes block type before entering any text, we can
    // either style the placeholder or hide it. Let's just hide it now.
    let className = classNames("WikiEditor-editor", {
      "WikiEditor-hidePlaceholder": shouldHidePlaceholder(contentState)
    });

    return (
      <div className="WikiEditor-root">
        <div className="WikiEditor-toolbar">
          {ToolbarComponent}
        </div>
        <div className={className}>
          {EditorComponent}
        </div>
      </div>
    );
  }
}

export default WikiEditor;
