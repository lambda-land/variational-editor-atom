'use babel';

declare module 'atom' {
  class CompositeDisposable {
    add(command: any): void;
  }
}


import $ from 'jquery';
import 'spectrum-colorpicker';
import { CompositeDisposable } from 'atom';
import { exec } from 'child_process';
import { VJavaUI, DimensionUI } from './ui'

// ----------------------------------------------------------------------------

declare global {
  interface Array<T> {
    last(): T | undefined;
  }
  namespace AtomCore {
    interface IEditor {
      getTextInBufferRange(span: Span) : string;
      getTextInBufferRange(span: number[][]) : string;
    }
    interface Panel {
      destroy();
    }
  }
}

if (!Array.prototype.last) {
  Array.prototype.last = function() {
    return this[this.length - 1];
  }
}

// ----------------------------------------------------------------------------

//declared out here so that they may be accessed from the document itself
//only for debugging purposes.
function getLeftCssClass(dimName) {
  return 'dimension-marker-' + dimName + "-left";
}

function getRightCssClass(dimName) {
  return 'dimension-marker-' + dimName + "-right";
}

function rangeToSpan(range): Span {
  const span: Span = { start: [range.start.row, range.start.column],
                     end: [range.end.row, range.end.column]};
  return span;
}

// ----------------------------------------------------------------------------

// organize this stuff please.
var linesRemoved = 0;
var linesReAdded = 0;

function shadeColor(hex: string, lum?: number) {

	// validate hex string
	hex = String(hex).replace(/[^0-9a-f]/gi, '');
	if (hex.length < 6) {
		hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
	}

	lum = lum || 0;

	// convert to decimal and change luminosity
	var rgb = "#", c, i;
	for (i = 0; i < 3; i++) {
		c = parseInt(hex.substr(i*2,2), 16);
		c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
		rgb += ("00"+c).substr(c.length);
	}

	return rgb;
}

// the heck is this state doing here?
var rendering = false;
const mainDivId = 'variationalJavaUI';
const enclosingDivId = 'enclosingDivJavaUI';
const secondaryDivId = 'variationalJavaUIButtons';

var iconsPath = atom.packages.resolvePackagePath("variational-java") + "/icons";

class NestLevel {
  selector: string
  dimension: ChoiceNode
}

class Selection {
  name: string
  left: boolean
  right: boolean
}

type Branch = "left" | "right"

class VJava {

  nesting: NestLevel[] // a stack represented nested dimensions
  selections: Selection[]
  ui: VJavaUI
  doc: RegionNode
  raw: ""
  colorpicker: {}
  dimensionColors: {}
  activeChoices: string[] // in the form of dimensionId:left|right
  subscriptions: {}

  // initialize the user interface
  // TODO: make this a function that returns an object conforming to VJavaUI
  createUI() {

    console.log("Here's jQuery:");
    console.log($);
    var mainUIElement = $(`<div id='${enclosingDivId}'><div id='${mainDivId}'></div>
                           <div id='${secondaryDivId}' class='vjava-secondary'>
                             <a href='' id='addNewDimension'><img id='addNewDimensionImg' border="0" src="${iconsPath}/add_square_button.png" width="30" height="30"/> </a>
                           </div></div>`);
    this.ui.panel = atom.workspace.addRightPanel({item: mainUIElement});
    this.ui.panel.hide();
    this.ui.main = $(`#${mainDivId}`);
    this.ui.secondary = $(`#${secondaryDivId}`);
    this.ui.message = this.ui.main.find("#message");

    // consider css :hover for this...
    $("#addNewDimension").on('mouseover', () => {
      $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button_depressed.png`);
    });
    $("#addNewDimension").on('mouseout', () => {
      $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button.png`);
    });
    // ---
    // add listeners for ui buttons

    // TODO: this click handler needs a name and a place to live.
    $("#addNewDimension").on('click', () => {
      var dimName = 'NEW';

      var dimension: DimensionUI = {
        name: dimName,
        color: '#7a2525'
      };

      // goddamn, dude
      var nameDiv = $(`<div class='form-group dimension-ui-div' id='new-dimension'><h2><input id='new-dimension-name' class='native-key-bindings new-dimension-name' type='text' value='${dimName}'></h2></div>`)

      this.ui.main.append(nameDiv);

      $('#new-dimension-name').focus();
      $('#new-dimension-name').on('focusout', () => {
          dimName = $('#new-dimension-name').val();
          for(var i = 0; i < this.ui.dimensions.length; i ++) {
              if(this.ui.dimensions[i].dimension === dimName) {
                  alert('Please select a unique name for this dimension');
                  setTimeout(() => {
                     $('#new-dimension-name').focus();
                  }, 100);
                  return;
              }
          }

          dimension.name = dimName;


          //TODO: ensure name is unique

          nameDiv.remove();

          var dimDiv = $(`<div class='form-group dimension-ui-div' id='${dimName}'>
            <a href='' id='removeDimension-${dimName}'><img id='removeDimensionImg' class='delete_icon' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
            <input class="jscolor" id="${dimName}-colorpicker" value="ab2567">
            <h2>${dimName}</h2
            <br>
            <span class='edit edit-enabled' id='${dimName}-edit-left'>&#9998;</span>
            <span class='view view-enabled' id='${dimName}-view-left'>&#128065;</span>
                <span class='choice-label' id='${dimName}-left-text'>Left</span><br>
            <span class='edit edit-enabled' id='${dimName}-edit-right'>&#9998;</span>
            <span class='view view-enabled' id='${dimName}-view-right'>&#128065;</span>
                <span class='choice-label' id='${dimName}-right-text'>Right</span><br></div>`);
          this.ui.main.append(dimDiv);


          document.getElementById('removeDimension-' + dimName).addEventListener("click", () => {
            this.removeDimension(dimName);
          });

          this.addViewListeners(dimension);


          dimension.colorpicker = $(document.getElementById(dimension.name + '-colorpicker')).spectrum({
            color: dimension.color
          }).on('change', () => {
            this.updateDimensionColor(dimension);
          });

          this.ui.dimensions.push(dimension);
      });
    });
  }

  //update the color of all matching dimensions in the document
  updateDimensionColor(dimension) {
    this.ui.session[dimension.dimension] = dimension.color;
    for(var i = 0; i < this.doc.segments.length; i ++) {
      this.changeDimColor(dimension, this.doc[i]);
    }
    this.updateColors();
  }

  //change this node's color if appropriate, and recurse if necessary
  changeDimColor(dimension, node) {
    if(node.type == 'choice') {
      if(node.dimension == dimension.dimension) {
        node.color = dimension.colorpicker.spectrum('get').toHexString();
      }

      for(var i = 0; i < node.left.segments.length; i ++) {
        this.changeDimColor(dimension, node.left.segments[i]);
      }
      for(var i = 0; i < node.right.segments.length; i ++) {
        this.changeDimColor(dimension, node.right.segments[i]);
      }
    }
  }

  getChoiceRange(choice) {
    return [choice[0].span.start,choice.last().span.end];
  }

  getChoiceColumnRange(choice) {
    if(choice.length < 1) return [0,-1]; //hack to prevent empty alternatives from bumping things around
    return [choice[0].span.start[0],choice.last().span.end[0]];
  }

  renderContents(item) {
    var editor = atom.workspace.getActiveTextEditor();
    item.span.start[0] = item.span.start[0] - linesRemoved;
    var content;
    if(item.type === 'choice') {
      //found is used to see if any selections have been made - if this is a brand new dimension, default both branches to shown
      var found = false;
      var selection;
      for (var i = 0; i < this.selections.length; i ++) {
        if (this.selections[i].name === item.dimension) {
          found = true;
          selection = this.selections[i];
          break;
        }
      }

      //see if this branch should be displayed
      var left = '';
      if(!found || selection['left']) {
        left = left + '\n'
        if(item.left.segments.length > 0) {
          for(var j = 0; j < item.left.segments.length; j ++) {
            left = left + this.renderContents(item.left.segments[j]);
          }
        }
      }
      //otherwise, we're hiding the left dimension. in this case, adjust all spans appropriately
      else {
        var choiceRange = this.getChoiceColumnRange(item.left);
        var size = choiceRange[1]-choiceRange[0];
        //+1 for inclusive lines
        linesRemoved = linesRemoved + size + 1;
      }

      var right = '';
      if(!found || selection['right']) {
        if(item.right.segments.length > 0) {
          right = '\n' + right;
          for(var j = 0; j < item.right.segments.length; j ++) {
            right = right + this.renderContents(item.right.segments[j]);
          }
        }
      }
      //otherwise, we're hiding the right dimension. In this case, adjust all spans appropriately
      else {
        var choiceRange = this.getChoiceColumnRange(item.right);
        //+1 for inclusive lines
        var size = choiceRange[1]-choiceRange[0] + 1;
        linesRemoved = linesRemoved + size;
      }
      //don't forget newline to account for the '#endif' keyword
      right = right + '\n';

      content = left + right;


    } else {
      content = item.content;
    }
    item.span.end[0] = item.span.end[0] - linesRemoved;
    return content;
  }

  clearColors() {
    $("#ifdef-color-styles").remove();
  }

  updateColors() {
    this.clearColors();
    var colors = '';
    for(var i = 0; i < this.doc.segments.length; i ++) {
        colors = colors + this.setColors(this.doc[i]);
    }
    $('head').append(`<style id='dimension-color-styles'>${colors}</style>`);
  }

  setColors(node) {
      //if this is a dimension
      var colors = '';
      if(node.type === 'choice') {
          var dimension = node;
          var color = dimension.color;

          //find the color for the left alternative
          var leftcolor = shadeColor(color, .1);
          var rightcolor = shadeColor(color, -.1);

          var selectors = [];
          var nestColors = [];

          if(this.nesting.length > 0) {
            for(var j = 0; j < this.nesting.length; j ++) {
              //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
              selectors.push('.nested-' + this.nesting[j].selector + '-' + j);
              var branch: Branch = this.nesting[j].selector.split('-')[1];

              //pre-shading nest color
              var nestcolor = this.nesting[j].dimension.color;

              //nest in the correct branch color
              if(branch === 'left') nestcolor = shadeColor(nestcolor, .1);
              else nestcolor = shadeColor(nestcolor, -.1);

              nestColors.push(nestcolor);
            }

            var selector = selectors.join(' ');
            //construct the nest gradient
            var x = 0;
            var increment = 1;
            var nestGradient = nestColors[0] + ' 0%';
            for(var j = 1; j < nestColors.length; j++) {
              x = (j) * increment;
              nestGradient = `${nestGradient}, ${nestColors[j]} ${x}%`;
            }

            //add the colors and borders as styles to the document head

            colors = colors +
            `atom-text-editor::shadow ${selector}.${getLeftCssClass(dimension.dimension)} {
              background: linear-gradient( 90deg, ${nestGradient}, ${leftcolor} ${x+increment}%);
            }
            atom-text-editor::shadow  ${selector}.${getRightCssClass(dimension.dimension)} {
              background: linear-gradient( 90deg, ${nestGradient}, ${rightcolor} ${x+increment}%);
            }`
          } else {
            colors = colors +
            `atom-text-editor::shadow .${getLeftCssClass(dimension.dimension)} {
              background-color: ${leftcolor};
            }
            atom-text-editor::shadow .${getRightCssClass(dimension.dimension)} {
              background-color: ${rightcolor};
            }`
          }

          //recurse left and right
          this.nesting.push({ selector: `${node.dimension}-left`, dimension: dimension});
          //recurse on left and right
          for(var i = 0; i < node.left.segments.length; i ++) {
            colors = colors + this.setColors(node.left.segments[i]);
          }
          this.nesting.pop();

          this.nesting.push({ selector: `${node.dimension}-right`, dimension: dimension});
          for(var i = 0; i < node.right.segments.length; i ++) {
            colors = colors + this.setColors(node.right.segments[i]);
          }
          this.nesting.pop();
      }
      return colors;
  }

  toggleDimensionEdit(dimension, branch) {
    var otherbranch;
    if(branch === 'left') otherbranch = 'right';
    else otherbranch = 'left';
    if($(`#${dimension.dimension}-edit-${branch}`).hasClass('edit-enabled')) {
      $(`#${dimension.dimension}-edit-${branch}`).removeClass('edit-enabled');
      $(`#${dimension.dimension}-edit-${branch}`).addClass('edit-locked');

      var index = this.activeChoices.indexOf(`${dimension.dimension}:${branch}`);
      this.activeChoices.splice(index,1);

    } else {
      $(`#${dimension.dimension}-edit-${branch}`).addClass('edit-enabled');
      $(`#${dimension.dimension}-edit-${branch}`).removeClass('edit-locked');


      var index = this.activeChoices.indexOf(`${dimension.dimension}:${branch}`);
      if (index < 0) this.activeChoices.push(`${dimension.dimension}:${branch}`);
    }
    if($(`#${dimension.dimension}-edit-${otherbranch}`).hasClass('edit-enabled')) {
      $(`#${dimension.dimension}-edit-${otherbranch}`).removeClass('edit-enabled');
      $(`#${dimension.dimension}-edit-${otherbranch}`).addClass('edit-locked');

      var index = this.activeChoices.indexOf(`${dimension.dimension}:${otherbranch}`);
      this.activeChoices.splice(index,1);
    }
  }

  addViewListeners(dimension) {
    $(`#${dimension.dimension}-disable-right`).on('click', () => {
      //switch the right branch to view mode
      $(`#${dimension.dimension}-view-right`).show();
      $(`#${dimension.dimension}-disable-right`).hide();

      //make appropriate changes to the document
      this.selectRight(dimension.dimension);
    });

    $(`#${dimension.dimension}-view-right`).on('click', () => {
        //put the right alternative in edit mode
        $(`#${dimension.dimension}-view-right`).hide();
        $(`#${dimension.dimension}-edit-right`).show();
        this.toggleDimensionEdit(dimension, 'right');

        //ensure that the left alternative isn't in edit mode
        if($(`#${dimension.dimension}-edit-left`).is(":visible")) {
          $(`#${dimension.dimension}-view-left`).show();
          $(`#${dimension.dimension}-edit-left`).hide();

          //remove the left selection since one has been made
          var index = this.activeChoices.indexOf(`${dimension.dimension}:left`);
          this.activeChoices.splice(index,1);

        }

        this.activeChoices.push(`${dimension.dimension}:right`)
    });

    $(`#${dimension.dimension}-edit-right`).on('click', () => {
      //go back to viewing
      $(`#${dimension.dimension}-view-right`).show();
      $(`#${dimension.dimension}-edit-right`).hide();

      //remove the right selection since one has been made
      var index = this.activeChoices.indexOf(`${dimension.dimension}:right`);
      this.activeChoices.splice(index,1);
    });

    $(`#${dimension.dimension}-view-right`).on('contextmenu', () => {
      //as long as the left alternative isn't also hidden, hide this one
      if(!$(`#${dimension.dimension}-disable-left`).is(":visible")) {
        //put the right alternative in edit mode
        $(`#${dimension.dimension}-view-right`).hide();
        $(`#${dimension.dimension}-disable-right`).show();
        this.unselectRight(dimension.dimension);
      }
      return false;
    });


    $(`#${dimension.dimension}-disable-left`).on('click', () => {
      //switch the right branch to view mode
      $(`#${dimension.dimension}-view-left`).show();
      $(`#${dimension.dimension}-disable-left`).hide();

      //make appropriate changes to the document
      this.selectLeft(dimension.dimension);
    });

    $(`#${dimension.dimension}-view-left`).on('click', () => {
        //put the right alternative in edit mode
        $(`#${dimension.dimension}-view-left`).hide();
        $(`#${dimension.dimension}-edit-left`).show();

        //ensure that the right alternative isn't in edit mode
        if($(`#${dimension.dimension}-edit-right`).is(":visible")) {
          $(`#${dimension.dimension}-view-right`).show();
          $(`#${dimension.dimension}-edit-right`).hide();

          //remove the left selection since one has been made
          var index = this.activeChoices.indexOf(`${dimension.dimension}:right`);
          this.activeChoices.splice(index,1);

        }
        this.activeChoices.push(`${dimension.dimension}:left`);
    });

    $(`#${dimension.dimension}-edit-left`).on('click', () => {
      //go back to viewing
      $(`#${dimension.dimension}-view-left`).show();
      $(`#${dimension.dimension}-edit-left`).hide();

      //remove the right selection since one has been made
      var index = this.activeChoices.indexOf(`${dimension.dimension}:right`);
      this.activeChoices.splice(index,1);
    });

    $(`#${dimension.dimension}-view-left`).on('contextmenu', () => {
        //as long as the right alternative isn't also hidden, hide this one
        if(!$(`#${dimension.dimension}-disable-right`).is(":visible")) {
          //put the left alternative in edit mode
          $(`#${dimension.dimension}-view-left`).hide();
          $(`#${dimension.dimension}-disable-left`).show();
          this.unselectLeft(dimension.dimension);
        }
        return false;
    });
  }

  docToPlainText(node, editor) {
      var finalContents = [];
      for(var i = 0; i < this.doc.segments.length; i ++) {
        finalContents.push(this.nodeToPlainText(this.doc[i], editor, false));
      }
      return finalContents.join('');
  }

  nodeToPlainText(node, editor, useOldContent) {
    if(node.type === 'choice') {
      var found = false;
      var selection;
      for (var i = 0; i < this.selections.length; i ++) {
        if (this.selections[i].name === node.dimension) {
          found = true;
          selection = this.selections[i];
          break;
        }
      }

      var contents = `\n#ifdef ${node.dimension}`;
      useOldContent = found && !selection['left'];

      for(var j = 0; j < node.left.segments.length; j ++) {
        var blob = this.nodeToPlainText(node.left.segments[j], editor, useOldContent);
        //add an extra newline if text was added on the first line
        if(j == 0 && blob[0] != '\n') {
          blob = '\n' + blob;
        }
        contents = contents + blob;
      }

      useOldContent = found && !selection['right'];
      if(node.right.segments.length > 0) {
        contents = contents + '\n#else';
        for(var j = 0; j < node.right.segments.length; j ++) {
          var blob = this.nodeToPlainText(node.right.segments[j], editor, useOldContent);
          if(j == 0 && blob[0] != '\n') {
            blob = '\n' + blob;
          }
          contents = contents + blob;
        }
      }
      return contents + '\n#endif';

    } else {
      //if this node is currently hidden, use its stored content instead of the range, will will be incorrect
      if(useOldContent) return node.content;
      else return editor.getTextInBufferRange(node.marker.getBufferRange());
    }
  }

  //using the list of dimensions contained within the ui object,
  //add html elements, markers, and styles to distinguish dimensions for the user
  renderDimensionUI(editor, node) {

    //if this is a dimension
    if(node.type === 'choice') {
        var found = false;
        var selection;
        for (var i = 0; i < this.selections.length; i ++) {
          if (this.selections[i].name === node.dimension) {
            found = true;
            selection = this.selections[i];
            break;
          }
        }

        //first try to use the color on the dimension
        if(node.color) {
          //if that exists, we're good
        }
        //next try the session color set
        else if(this.ui.session[node.dimension]) {
          node.color = this.ui.session[node.dimension];
        }
        //lastly default to something ugly
        else {
          node.color = '#7a2525';
          this.ui.session[node.dimension] = node.color;
        }

        //and this dimension has not yet been parsed
        if(this.ui.dimensions.indexOf(node.dimension) < 0) {

            //initialize this dimension for future selection
            this.selections.push({ name: node.dimension, left: true, right: true});


            //add this to the list of parsed dimensions, and generate a UI element for it
            this.ui.dimensions.push(node.dimension);

            var dimDiv = $(`<div class='form-group dimension-ui-div' id='${node.dimension}'>
              <a href='' id='removeDimension-${node.dimension}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
              <input type='text' id="${node.dimension}-colorpicker">
              <h2>${node.dimension}</h2>
              <br>
              <span class='toggle-left'>
              <span class='edit' id='${node.dimension}-disable-left' style='display: none;'>&nbsp;&nbsp;&nbsp;</span>
              <span class='edit edit-enabled' id='${node.dimension}-edit-left' style='display: none;'>&#9998;</span>
              <span class='view view-enabled' id='${node.dimension}-view-left'>&#128065;</span>
              </span>
              <span class='choice-label' id='${node.dimension}-left-text'>Left</span><br>
              <span class='toggle-right'>
              <span class='edit' id='${node.dimension}-disable-right' style='display: none;'>&nbsp;&nbsp;&nbsp;</span>
              <span class='edit edit-enabled' id='${node.dimension}-edit-right' style='display: none;'>&#9998;</span>
              <span class='view view-enabled' id='${node.dimension}-view-right'>&#128065;</span>
              </span>
              <span class='choice-label' id='${node.dimension}-right-text'>Right</span><br></div>  `);
            this.ui.main.append(dimDiv);

            //make choice selections if necessary

            //see if a  choice has been made in this dimension
            var index = this.activeChoices.indexOf(`${node.dimension}:left`);
            if(index < 0) index = this.activeChoices.indexOf(`${node.dimension}:right`);

            //if so, toggle the ui appropriately
            if(index >= 0) { //this implies that a selection already exists for this element

              var choice = this.activeChoices[index];
              var branch = choice.split(':')[1];
              this.toggleDimensionEdit(node, branch);
            }

            //only hook up listeners, etc. once!
            document.getElementById('removeDimension-' + node.dimension).addEventListener("click", () => {
              this.removeDimension(node.dimension);
            });

            this.addViewListeners(node);

            node.colorpicker = $(`#${node.dimension}-colorpicker`).spectrum({
              color: node.color
            }).on('change', () => {
              this.updateDimensionColor(node);
            });
        }


        if((!found || selection['left']) && node.left.segments.length > 0) {
            //add markers for this new range of a (new or pre-existing) dimension
            var leftRange = editor.markBufferRange(this.getChoiceRange(node.left));

            //decorate with the appropriate css classes
            editor.decorateMarker(leftRange, {type: 'line', class: getLeftCssClass(node.dimension)});

            for(var i = this.nesting.length - 1; i >= 0; i --) {
              //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
              editor.decorateMarker(leftRange, {type: 'line', class: 'nested-' + this.nesting[i].selector + '-' + i});
            }

            this.nesting.push({ selector: `${node.dimension}-left`, dimension: node});
            //recurse on left and right
            for(var i = 0; i < node.left.segments.length; i ++) {
              this.renderDimensionUI(editor, node.left.segments[i]);
            }
            this.nesting.pop();
        }

        if((!found || selection['right']) && node.right.segments.length > 0) {

            var rightRange = editor.markBufferRange(this.getChoiceRange(node.right));

            editor.decorateMarker(rightRange, {type: 'line', class: getRightCssClass(node.dimension)});
            for(var i = this.nesting.length - 1; i >= 0; i --) {
              //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
              editor.decorateMarker(rightRange, {type: 'line', class: 'nested-' + this.nesting[i].selector + '-' + i});
            }

            this.nesting.push({ selector: `${node.dimension}-right`, dimension: node});
            for(var i = 0; i < node.right.segments.length; i ++) {
              this.renderDimensionUI(editor, node.right.segments[i]);
            }
            this.nesting.pop();
        }

    } else {
      node.marker = editor.markBufferRange(node.span);
    }
  }

  removeDimension(dimName) {
      var sure = confirm('Are you sure you want to remove this dimension? Any currently \
              visible code in this dimension will be promoted. Any hidden code will be removed.')

      if(sure) {
        //find the dimension and remove it
        for(var i = 0; i < this.ui.dimensions.length; i ++) {
          if(this.ui.dimensions[i].name = dimName) {
            this.ui.dimensions.splice(i,1);
            $("#" + dimName).remove();
            this.promoteBranchesForDimension(dimName);
            this.updateColors();
          }
        }
      } else {
        return;
      }
  }

  promoteBranchesForDimension(dimName: string) {
    var editor = atom.workspace.getActiveTextEditor();

    //if no selection made, promote both branches to be safe
    var left = true;
    var right = true;

    //find the selections that were made to know which branches to promote
    for (let selection of this.selections) {
      if (selection.name === dimName) {
        left = selection.left;
        right = selection.right;
        break;
      }
    }

    for(var j = 0; j < this.doc.segments.length; j++) {
      var segment = this.doc.segments[j];
      if(segment.type === "choice") {
        if(segment.dimension === dimName) {
          this.doc.segments.splice(j, 1, ... this.promoteBranchForDimensionInNode(segment, editor, dimName, left, right));
        } else {
          for(var i = 0; i < segment.left.segments.length; i ++) {
            var lsegment = segment.left.segments[i];
            if(lsegment.type === 'choice' && lsegment.dimension === dimName) {
              lsegment.left.segments.splice(i, 1, ... this.promoteBranchForDimensionInNode(lsegment, editor, dimName, left, right));
            }
          }
          for(var i = 0; i < segment.right.segments.length; i ++) {
            var rsegment = segment.right.segments[i];
            if(rsegment.type === 'choice' && rsegment.dimension === dimName) {
              segment.right.segments.splice(i, 1, ... this.promoteBranchForDimensionInNode(rsegment, editor, dimName, left, right));
            }
          }
        }
      }
    }
  }

  //left and right represent whether the left and right branches should be promoted
  //a value of 'true' indicates that the content in that branch should be promoted
  promoteBranchForDimensionInNode(node: ChoiceNode, editor, dimName, left, right) : SegmentNode[] {
    //if this is the dimension being promoted, then do that
    if(node.dimension === dimName) {
      //TODO: is this a memory leak? removing references to these objects but perhaps never deleting them
      var region = [];
      if(left) region = region.concat(node.left);
      else this.deleteBranch(node.left, editor);
      if(right) region = region.concat(node.right);
      else this.deleteBranch(node.right, editor);
      return region;
    }

    //otherwise recurse
    else {
      for(var i = 0; i < node.left.segments.length; i ++) {
        var lsegment = node.left.segments[i];
        if(lsegment.type === 'choice' && lsegment.dimension === dimName) {
          node.left.segments.splice(i, 1, ... this.promoteBranchForDimensionInNode(lsegment, editor, dimName, left, right));
        }
      }
      for(var i = 0; i < node.right.segments.length; i ++) {
        var rsegment = node.right.segments[i];
        if(rsegment.type === 'choice' && rsegment.dimension === dimName) {
          node.right.segments.splice(i, 1, ... this.promoteBranchForDimensionInNode(rsegment, editor, dimName, left, right));
        }
      }
    }
  }

  deleteBranch(region: RegionNode, editor) {
    for(let segment of region.segments) {
      if(segment.type === 'choice') {
        this.deleteBranch(segment.left, editor);
        this.deleteBranch(segment.right, editor);
      } else {
        editor.setTextInBufferRange(segment.marker.getBufferRange(), '');
      }
    }
  }

  preserveChanges(editor) {
    for(var i = 0; i < this.doc.segments.length; i++) {
      this.preserveChangesonNode(editor, this.doc[i]);
    }
  }

  preserveChangesonNode(editor, node: SegmentNode) {
    if(node.type === 'choice') {
      //found is used to see if any selections have been made - if this is a brand new dimension, default both branches to shown
      var found = false;
      var selection;
      for (var i = 0; i < this.selections.length; i ++) {
        if (this.selections[i].name === node.dimension) {
          found = true;
          selection = this.selections[i];
          break;
        }
      }
      if(!found || selection['left']) {
        for(var j = 0; j < node.left.segments.length; j ++) {
          this.preserveChangesonNode(editor, node.left.segments[j]);
        }
      }
      if(!found || selection['right']) {
        for(var j = 0; j < node.right.segments.length; j ++) {
          this.preserveChangesonNode(editor, node.right.segments[j]);
        }
      }


    } else {
      node.content = editor.getTextInBufferRange(node.marker.getBufferRange());
      node.span = rangeToSpan(node.marker.getBufferRange());
    }
  }

  renderDocument(editor) {
    linesRemoved = 0;
    var contents = [];
    for(var i = 0; i < this.doc.segments.length; i ++) {
      contents.push(this.renderContents(this.doc[i]));
    }
    var contentString = contents.join('');

    editor.setText(contentString);
  }

  adjustForReShow(editor, dimension, branch) {
    linesReAdded = 0;
    for(var i = 0; i < this.doc.segments.length; i ++) {
      this.adjustNode(this.doc[i], editor, dimension, branch);
    }
  }

  adjustNode(node, editor, dimension, branch) {
    node.span.start[0] = node.span.start[0] + linesReAdded;
    if(node.type === 'choice') {
      if(node.dimension === dimension && branch === 'left') {
        var choiceRange = this.getChoiceColumnRange(node.left);
        var size = choiceRange[1]-choiceRange[0];
        linesReAdded = linesReAdded + size + 1;
      } else {
        for(var i = 0; i < node.left.segments.length; i ++) {
          this.adjustNode(node.left.segments[i], editor, dimension, branch);
        }
      }

      if(node.dimension === dimension && branch === 'right') {
        var choiceRange = this.getChoiceColumnRange(node.right);
        var size = choiceRange[1]-choiceRange[0];
        linesReAdded = linesReAdded + size + 1;
      } else {
        for(var i = 0; i < node.right.segments.length; i ++) {
          this.adjustNode(node.right.segments[i], editor, dimension, branch);
        }
      }
    }
    node.span.end[0] = node.span.end[0] + linesReAdded;
  }

  //query the back-end parser, and call parseDimension where necessary
  parseVJava(textContents, next) {
    //send file contents to the backend, receive jsonified output
    var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
    exec('cd ' + packagePath);

    var spawn = require('child_process').spawn;
    var parser = spawn('variational-parser',[],{ cwd: packagePath });

    parser.stdout.setEncoding('utf8');
    parser.stdout.on('data', function (data) {
      this.originalDoc = JSON.parse(data.toString());
      this.doc = JSON.parse(data.toString());
      next();
    });
    parser.on('exit', function (code) {
      console.log('child process exited with code ' + code);
    });

    parser.stdin.write(textContents);
    parser.stdin.end();

    return;
  }

  // these four functions execute a put with the old selections,
  // then a pull with the new selections
  // display both alternatives
  // show the right alternative
  selectRight(dimName) {
    var editor = atom.workspace.getActiveTextEditor();
    this.preserveChanges(editor);
    for (var i = 0; i < this.selections.length; i ++) {
      if (this.selections[i].name === dimName) {
        this.selections[i].right = true;
      }
    }
    this.adjustForReShow(editor, dimName, 'right');
    this.renderDocument(editor);
    for(var i = 0; i < this.doc.segments.length; i ++) {
      this.renderDimensionUI(editor, this.doc[i]);
    }
  }

  // hide the right alternative
  unselectRight(dimName) {
    var editor = atom.workspace.getActiveTextEditor();
    this.preserveChanges(editor);
    for (var i = 0; i < this.selections.length; i ++) {
      if (this.selections[i].name === dimName) {
        this.selections[i].right = false;
      }
    }
    this.renderDocument(editor);
    for(var i = 0; i < this.doc.segments.length; i ++) {
      this.renderDimensionUI(editor, this.doc[i]);
    }
  }

  // show the left alternative
  selectLeft(dimName) {
    var editor = atom.workspace.getActiveTextEditor();
    this.preserveChanges(editor);
    for (var i = 0; i < this.selections.length; i ++) {
      if (this.selections[i].name === dimName) {
        this.selections[i].left = true;
      }
    }
    this.adjustForReShow(editor, dimName, 'left');
    this.renderDocument(editor);
    for(var i = 0; i < this.doc.segments.length; i ++) {
      this.renderDimensionUI(editor, this.doc[i]);
    }
  }

  // hide the left alternative
  unselectLeft(dimName) {
    var editor = atom.workspace.getActiveTextEditor();
    this.preserveChanges(editor);
    for (var i = 0; i < this.selections.length; i ++) {
      if (this.selections[i].name === dimName) {
        this.selections[i].left = false;
      }
    }

    this.renderDocument(editor);
    for(var i = 0; i < this.doc.segments.length; i ++) {
      this.renderDimensionUI(editor, this.doc[i]);
    }
  }

  activate(state) {
    // TODO: load session from a file somewhere?
    this.ui = new VJavaUI();
    this.ui.session = {};

    this.selections = !$.isEmptyObject({}) ? state : [];

    var activeEditor = atom.workspace.getActiveTextEditor();

    var contents = activeEditor.getText();

    //parse the file
    this.parseVJava(contents, function() {
      // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
      this.subscriptions = new CompositeDisposable();

      this.ui.dimensions = [];

      this.createUI();

      this.renderDocument(activeEditor);

      for(var i = 0; i < this.doc.segments.length; i ++) {
        this.renderDimensionUI(activeEditor, this.doc[i]);
      }


      this.updateColors(activeEditor);

      // Register command that toggles vjava view
      this.subscriptions.add(atom.commands.add('atom-workspace', {
        'variational-java:toggle': () => this.toggle()
      }));
      this.subscriptions.add(atom.commands.add('atom-workspace', {
        'variational-java:add-choice-segment': () => this.addChoiceSegment()
      }));
      //preserve the contents for later comparison (put, get)
      this.raw = contents;

      this.ui.panel.show();
    });

  }

  deactivate() {
  }

  serialize() {
    var selections = {};
    //TODO: implement this
    // $(`#${mainDivId} .dimension-ui-div`).each(function (dn, dim) {
    //   var dimName = $(dim).find('[id*=left]').attr('id').split('-left')[0];
    //   if($(dim).find('[id*=-left]').selected) {
    //     selections[dimName] = 'left';
    //   } else if ($(dim).find('[id*=-right]').selected) {
    //     selections[dimName] = 'right';
    //   } else {
    //     selections[dimName] = 'unselected';
    //   }
    // });
    return selections;
  }

  addChoiceSegment() {

    if(!this.activeChoices[0]) {
        alert('please make a selection before inserting a choice segment');
        return;
    };

    var activeEditor = atom.workspace.getActiveTextEditor();


    var lit = 'new dimension';

    //we have to grab the zero index for some stupid reason
    var newRange = activeEditor.insertText(lit)[0];

      var marker = activeEditor.markBufferRange(newRange);
      node.marker = marker;

      var choice = this.activeChoices[0];
      var branch: Branch = choice.split(':')[1];
      var dim = choice.split(':')[0];

      var node: ChoiceNode = {
        span: {
          start: [newRange.start.row, newRange.start.column],
          end: [newRange.end.row+1, newRange.end.column]
        },
        dimension: dim,
        color: this.ui.session[dim],
        type: 'choice',
        left: {segments: [], type: "region"},
        right: {segments: [], type: "region"}
      }

      var newspan: Span = {
        start: [newRange.start.row+1, newRange.start.column],
        end: [newRange.end.row+2, newRange.end.column]
      };

      node[branch].segments = [
        {
          span: newspan,
          marker: activeEditor.markBufferRange(newRange),
          content: '\n' + lit,
          type: 'text'
        }
      ];

      this.insertVNode(node);
      this.renderDocument(activeEditor);

      for(var i = 0; i < this.doc.segments.length; i ++) {
        this.renderDimensionUI(activeEditor, this.doc[i]);
      }

      this.updateColors();
  }

  insertVNode(node) {
      linesReAdded = 0;

      for(var i = 0; i < this.doc.segments.length; i++) {
        var ret = this.insertVNodeAt(this.doc[i], node);
        //found it, do the insertion
        if(ret) {
          this.doc.segments.splice(i, 1, ret.first, ret.second, ret.third);
          i = i + 2;
        }
      }
  }

  insertVNodeAt(here: SegmentNode, node: ChoiceNode) {
      var activeEditor = atom.workspace.getActiveTextEditor();

      if(here.marker) here.span = rangeToSpan(here.marker.getBufferRange());
      here.span.start[0] = here.span.start[0] + linesReAdded;

      var found;

      if(here.type === 'text') {
          if(here.span.start[0] <= node.span.start[0] && here.span.end[0]+1 >= node.span.end[0]) { //we must slice open this node

              //if we added a left alternative, we need 2 lines. if we added a right alternative, we require 3 lines
              var added = (node.left.segments.length > 0) ? 3 : 4;
              linesReAdded = linesReAdded + added;
              var firstRange: Span = {
                start: here.span.start,
                end: node.span.start
              };

              var firstContent = activeEditor.getTextInBufferRange(firstRange);

              //slice creates a copy so we can modify safely
              var thirdStart: number[] = node.span.end.slice(0, 2);
              thirdStart[0] = thirdStart[0] - 1;
              var thirdContent = activeEditor.getTextInBufferRange([thirdStart,here.span.end]);

              node.span.end[0] = node.span.end[0] + 1; //bump it down one to account for the extra newline inserted upon rendering document

              var thirdRange = {
                start: node.span.end,
                end: here.span.end
              };
              //do this manually since it won't get hit by the tree recursion
              thirdRange.end[0] = thirdRange.end[0] + linesReAdded;

              var first = {
                span: firstRange,
                marker: activeEditor.markBufferRange(firstRange),
                content: firstContent,
                type: 'text'
              };
              var second = node;
              var third = {
                span: thirdRange,
                marker: activeEditor.markBufferRange(thirdRange),
                content: thirdContent,
                type: 'text'
              };

              found = {
                first: first,
                second: second,
                third: third,
              };
        } else {
          found = false;
        }
    } else {
        for(var i = 0; i < here.left.segments.length; i++) {
          var ret = this.insertVNodeAt(here.left.segments[i], node);
          //found it, do the insertion
          if(ret) {
            here.left.segments.splice(i, 1, ret.first, ret.second, ret.third);
            i = i + 2;
          }
        }

        for(var i = 0; i < here.right.segments.length; i++) {
          var ret = this.insertVNodeAt(here.right.segments[i], node);
          if(ret) {
            here.right.segments.splice(i, 1, ret.first, ret.second, ret.third);
            i = i + 2;
          }
        }
        found = false;
    }
    if(!found) here.span.end[0] = here.span.end[0] + linesReAdded;
    return found;
  }

  toggle() {
    var activeEditor = atom.workspace.getActiveTextEditor();
    if(this.ui.panel.isVisible()) {
      $("#colorpickerscript").remove();
      this.ui.panel.destroy();
      this.ui.dimensions = [];

      //TODO: undo selections one at a time, then re-render. Important!
      activeEditor.setText(this.docToPlainText(this.doc, activeEditor));
    } else {
      rendering = true;

      var contents = activeEditor.getText();

      //parse the file
      this.parseVJava(contents, function() {


        this.ui.dimensions = [];

        this.createUI();

        this.renderDocument(activeEditor);

        for(var i = 0; i < this.doc.segments.length; i ++) {
          this.renderDimensionUI(activeEditor, this.doc[i]);
        }


        this.updateColors(activeEditor);

        //preserve the contents for later comparison (put, get)
        this.raw = contents;

        this.ui.panel.show();
      });

      rendering = false
    }


    return (true);
  }

};

export default new VJava();