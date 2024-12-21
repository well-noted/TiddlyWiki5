/*\
title: $:/plugins/tiddlywiki/multiwikiserver/widgets/checkboxcontroller.js
type: application/javascript
module-type: widget

Checkbox controller widget
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var CheckboxController = function(parseTreeNode,options) {
    this.initialise(parseTreeNode,options);
};

CheckboxController.prototype = new Widget();

CheckboxController.prototype.render = function(parent,nextSibling) {
    var self = this;
    this.computeAttributes();
    var action = this.getAttribute("action");
    var label = this.getAttribute("label","Select All");

    // Create the button widget
    var buttonNode = {
        type: "element",
        tag: "button",
        attributes: {
            "class": {type: "string", value: "tc-btn-invisible select-button"},
            "type": {type: "string", value: "button"}
        },
        children: [{
            type: "text",
            text: label
        }]
    };

    // Create and render the widget tree
    this.makeChildWidgets([buttonNode]);
    this.renderChildren(parent,nextSibling);

    // Add click handler after render
    if($tw.browser) {
        var buttonElement = this.domNodes[0];
        buttonElement.addEventListener("click", function(event) {
            var checkboxes = document.querySelectorAll('input[type="checkbox"]');
            var value = action === "select";
            Array.from(checkboxes).forEach(function(checkbox) {
                checkbox.checked = value;
            });
            event.preventDefault();
            event.stopPropagation();
        }, false);
    }
};

exports.checkboxcontroller = CheckboxController;

})();