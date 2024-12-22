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

						xhr.onload = function () {
							if (xhr.status === 200) {
								// Store blob in video element
								video._blob = new Blob([xhr.response], { type: video.type || 'video/mp4' });
								var url = URL.createObjectURL(video._blob);
								video.src = url;
								video.dataset.loaded = "true";
								
								// Handle seeking
								video.addEventListener('seeking', function() {
									if (!video._blob) return;
									// Recreate URL if needed
									if (!video.src || video.src === '') {
										video.src = URL.createObjectURL(video._blob);
									}
								});

								// Clean up only when video element is actually removed
								var observer = new MutationObserver(function(mutations) {
									mutations.forEach(function(mutation) {
										if ([...mutation.removedNodes].includes(video)) {
											URL.revokeObjectURL(video.src);
											delete video._blob;
											observer.disconnect();
										}
									});
								});

								observer.observe(video.parentNode, {
									childList: true
								});
							}
						};

						xhr.send();
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
