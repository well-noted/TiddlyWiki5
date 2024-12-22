/*\
title: $:/core/modules/parsers/videoparser.js
type: application/javascript
module-type: parser

The video parser parses a video tiddler into an embeddable HTML element

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var VideoParser = function(type,text,options) {
	var element = {
		type: "element",
		tag: "video",
		attributes: {
			controls: {type: "string", value: "controls"},
			style: {type: "string", value: "width: 100%; object-fit: contain"},
			preload: {type: "string", value: "auto"},
			class: {type: "string", value: "tw-video-element"}
		}
	};

	if(options._canonical_uri) {
		element.children = [{
			type: "element",
			tag: "source",
			attributes: {
				src: {type: "string", value: options._canonical_uri},
				type: {type: "string", value: type}
			}
		}];
	} else if(text) {
		element.attributes.src = {type: "string", value: "data:" + type + ";base64," + text};
	}

	if($tw.browser) {
		$tw.hooks.addHook("th-page-refreshed", function() {
			setTimeout(function() {
				Array.from(document.getElementsByClassName("tw-video-element")).forEach(function(video) {
					// Force aggressive loading
					video.preload = "auto";
					video.autobuffer = true;

					// Create XMLHttpRequest to load full file
					var xhr = new XMLHttpRequest();
					xhr.open('GET', video.currentSrc, true);
					xhr.responseType = 'blob';
					
					xhr.onprogress = function(e) {
						if (e.lengthComputable) {
							var percentComplete = (e.loaded / e.total) * 100;
							console.log("Loading: " + percentComplete.toFixed(2) + "%");
						}
					};
					
					xhr.onload = function() {
						if (xhr.status === 200) {
							var blob = new Blob([xhr.response], { type: type });
							var url = URL.createObjectURL(blob);
							video.src = url;
						}
					};
					
					xhr.send();

					// Monitor buffer state
					video.addEventListener("progress", function() {
						var buffered = this.buffered;
						if(buffered.length > 0) {
							var total = 0;
							for(var i = 0; i < buffered.length; i++) {
								var start = buffered.start(i);
								var end = buffered.end(i);
								total += (end - start);
								console.log(`Buffer ${i}: ${start}-${end} (${((end-start)/this.duration*100).toFixed(2)}%)`);
							}
							console.log(`Total buffered: ${(total/this.duration*100).toFixed(2)}%`);
						}
					});
				});
			}, 100);
		});
	}

	this.tree = [element];
	this.type = type;
};

exports["video/ogg"] = VideoParser;
exports["video/webm"] = VideoParser;
exports["video/mp4"] = VideoParser;
exports["video/quicktime"] = VideoParser;

})();
