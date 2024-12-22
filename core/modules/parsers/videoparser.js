/*\
title: $:/core/modules/parsers/videoparser.js
type: application/javascript
module-type: parser

The video parser parses a video tiddler into an embeddable HTML element

\*/
(function () {

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	var VideoParser = function (type, text, options) {
		var element = {
			type: "element",
			tag: "video",
			attributes: {
				controls: { type: "string", value: "controls" },
				style: { type: "string", value: "width: 100%; object-fit: contain" },
				preload: { type: "string", value: "auto" },
				class: { type: "string", value: "tw-video-element" }
			}
		};

		if (options._canonical_uri) {
			element.children = [{
				type: "element",
				tag: "source",
				attributes: {
					src: { type: "string", value: options._canonical_uri },
					type: { type: "string", value: type }
				}
			}];
		} else if (text) {
			element.attributes.src = { type: "string", value: "data:" + type + ";base64," + text };
		}

		if ($tw.browser) {
			$tw.hooks.addHook("th-page-refreshed", function () {
				setTimeout(function () {
					Array.from(document.getElementsByClassName("tw-video-element")).forEach(function (video) {
						if (video.dataset.loaded === "true") return;

						video.preload = "auto";
						video.autobuffer = true;

						var xhr = new XMLHttpRequest();
						xhr.open('GET', video.currentSrc, true);
						xhr.responseType = 'blob';

						xhr.onprogress = function (e) {
							if (e.lengthComputable) {
								console.log("Loading: " + (e.loaded / e.total * 100).toFixed(2) + "%");
							}
						};

						xhr.onload = function () {
							if (xhr.status === 200) {
								var blob = new Blob([xhr.response], { type: video.type || 'video/mp4' });
								var url = URL.createObjectURL(blob);
								video.src = url;
								video.dataset.loaded = "true";
								video.dataset.blobUrl = url;  // Store URL for cleanup

								// Clean up only when video element is removed
								video.addEventListener('remove', function() {
									if (video.dataset.blobUrl) {
										URL.revokeObjectURL(video.dataset.blobUrl);
										delete video.dataset.blobUrl;
									}
								});

								// Add unload cleanup
								window.addEventListener('unload', function() {
									if (video.dataset.blobUrl) {
										URL.revokeObjectURL(video.dataset.blobUrl);
									}
								});
							} else {
								console.log("Video load failed with status: " + xhr.status);
							}
						};

						xhr.onerror = function() {
							console.log("Error loading video");
						};

						xhr.send();

						video.addEventListener("progress", function () {
							var buffered = this.buffered;
							if (buffered.length > 0) {
								console.log("Buffer state: " + (buffered.end(0) / this.duration * 100).toFixed(2) + "%");
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
