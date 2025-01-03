/*\
title: $:/core/modules/parsers/audioparser.js
type: application/javascript
module-type: parser
\*/
(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	const Debug = {
		enabled: true,
		prefix: '🎵 [AudioParser]',

		log: function (message, data) {
			if (!this.enabled) return;
			if (data) {
				console.log(`${this.prefix} ${message}`, data);
			} else {
				console.log(`${this.prefix} ${message}`);
			}
		},

		error: function (message, error) {
			if (!this.enabled) return;
			console.error(`${this.prefix} ❌ ${message}`, error);
		}
	};

	function getAudioTimestampField(audio) {
		const sourceElement = audio.querySelector('source');
		let originalSrc = sourceElement ?
			sourceElement.getAttribute('src') :
			audio.getAttribute('src');

		let hash = 5381;
		for (let i = 0; i < originalSrc.length; i++) {
			hash = (hash * 33) ^ originalSrc.charCodeAt(i);
		}
		return `audio-timestamp-${Math.abs(hash >>> 0)}`;
	}

	var AudioParser = function (type, text, options) {
		Debug.log('Creating new AudioParser instance', { type, hasText: !!text, options });

		const element = {
			type: "element",
			tag: "div",
			attributes: {
				class: { type: "string", value: "audio-wrapper" },
				style: { type: "string", value: "display: flex; align-items: center; gap: 5px; padding: 5px; border-radius: 4px;" }
			},
			children: [
				{
					type: "element",
					tag: "button",
					attributes: {
						class: { type: "string", value: "skip-button skip-backward" },
						style: {
							type: "string", value: `
                            padding: 8px 12px;
                            background: #4a4a4a;
                            border: none;
                            border-radius: 4px;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-width: 70px;
                            transition: background-color 0.2s;
                        `}
					},
					children: [
						{
							type: "text",
							text: "⏪ 15s"
						}
					]
				},
				{
					type: "element",
					tag: "audio",
					attributes: {
						controls: { type: "string", value: "controls" },
						style: { type: "string", value: "flex-grow: 1; object-fit: contain;" },
						preload: { type: "string", value: "auto" },
						class: { type: "string", value: "tw-audio-element" },
						"data-loading": { type: "string", value: "true" }
					}
				},
				{
					type: "element",
					tag: "button",
					attributes: {
						class: { type: "string", value: "skip-button skip-forward" },
						style: {
							type: "string", value: `
                            padding: 8px 12px;
                            background: #4a4a4a;
                            border: none;
                            border-radius: 4px;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-width: 70px;
                            transition: background-color 0.2s;
                        `}
					},
					children: [
						{
							type: "text",
							text: "15s ⏩"
						}
					]
				}
			]
		};

		const audioElement = element.children[1];
		if (options._canonical_uri) {
			audioElement.children = [{
				type: "element",
				tag: "source",
				attributes: {
					src: { type: "string", value: options._canonical_uri },
					type: { type: "string", value: type }
				}
			}];
		} else if (text) {
			audioElement.attributes.src = {
				type: "string",
				value: "data:" + type + ";base64," + text
			};
		}

		if ($tw.browser) {
			$tw.hooks.addHook("th-page-refreshed", function () {
				setTimeout(function () {
					const wrappers = document.getElementsByClassName("audio-wrapper");

					Array.from(wrappers).forEach(function (wrapper) {
						const audio = wrapper.querySelector('.tw-audio-element');
						const backButton = wrapper.querySelector('.skip-backward');
						const forwardButton = wrapper.querySelector('.skip-forward');

						if (!audio.dataset.initialized) {
							audio.dataset.initialized = "true";

							// Button event listeners
							const skipBackward = () => {
								audio.currentTime = Math.max(0, audio.currentTime - 15);
							};

							const skipForward = () => {
								audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
							};

							// Desktop events
							backButton.addEventListener('click', function (e) {
								e.preventDefault();
								skipBackward();
							});

							forwardButton.addEventListener('click', function (e) {
								e.preventDefault();
								skipForward();
							});

							// Mobile touch events
							backButton.addEventListener('touchstart', function (e) {
								e.preventDefault();
								this.style.background = '#666666';
								skipBackward();
							});

							forwardButton.addEventListener('touchstart', function (e) {
								e.preventDefault();
								this.style.background = '#666666';
								skipForward();
							});

							// Button hover effects
							['mouseenter', 'touchstart'].forEach(event => {
								backButton.addEventListener(event, function () {
									this.style.background = '#666666';
								});
								forwardButton.addEventListener(event, function () {
									this.style.background = '#666666';
								});
							});

							['mouseleave', 'touchend'].forEach(event => {
								backButton.addEventListener(event, function () {
									this.style.background = '#4a4a4a';
								});
								forwardButton.addEventListener(event, function () {
									this.style.background = '#4a4a4a';
								});
							});

							// Media Session API for Android controls
							if ('mediaSession' in navigator) {
								navigator.mediaSession.setActionHandler('previoustrack', skipBackward);
								navigator.mediaSession.setActionHandler('nexttrack', skipForward);
								navigator.mediaSession.setActionHandler('seekbackward', skipBackward);
								navigator.mediaSession.setActionHandler('seekforward', skipForward);

								audio.addEventListener('loadedmetadata', function () {
									const currentTiddler = audio.closest('[data-tiddler-title]');
									const title = currentTiddler ?
										currentTiddler.getAttribute('data-tiddler-title') :
										'Audio';

									navigator.mediaSession.metadata = new MediaMetadata({
										title: title,
										artist: 'TiddlyWiki Audio',
										album: 'Audio Player'
									});
								});
							}

							// Original event listeners for playback position
							audio.addEventListener('play', function () {
								const currentTiddler = this.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									const savedTime = $tw.wiki.getTiddler(tiddlerTitle)
										?.fields[getAudioTimestampField(this)];
									if (savedTime && this.currentTime < 0.1) {
										this.currentTime = parseFloat(savedTime);
									}
								}
							});

							audio.addEventListener('pause', function () {
								const currentTiddler = this.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
									if (tiddler) {
										$tw.wiki.addTiddler(
											new $tw.Tiddler(
												tiddler,
												{ [getAudioTimestampField(this)]: this.currentTime.toString() }
											),
											{ suppressUpdate: true, quiet: true, dontNotify: true }
										);
									}
								}
							});

							audio.addEventListener('timeupdate', function () {
								if (!this.seeking &&
									(!this.lastUpdateTime ||
										(Date.now() - this.lastUpdateTime > 5000 &&
											Math.abs(this.currentTime - (this.lastSavedTime || 0)) > 2))) {

									const currentTiddler = this.closest('[data-tiddler-title]');
									if (currentTiddler) {
										const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
										const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
										if (tiddler) {
											this.lastSavedTime = this.currentTime;
											this.lastUpdateTime = Date.now();

											$tw.wiki.addTiddler(
												new $tw.Tiddler(
													tiddler,
													{ [getAudioTimestampField(this)]: this.currentTime.toString() }
												),
												{ suppressUpdate: true, quiet: true, dontNotify: true }
											);
										}
									}
								}
							});

							audio.addEventListener('error', function () {
								if (this.src.startsWith('blob:')) {
									URL.revokeObjectURL(this.src);
								}
							});

							// Load audio with retry support
							const loadAudio = function (retryCount = 0) {
								const xhr = new XMLHttpRequest();
								xhr.open('GET', audio.currentSrc, true);
								xhr.responseType = 'blob';

								xhr.onprogress = function (e) {
									if (e.lengthComputable) {
										Debug.log(`Loading progress: ${((e.loaded / e.total) * 100).toFixed(2)}%`);
									}
								};

								xhr.onload = function () {
									if (xhr.status === 200) {
										Debug.log('XHR load successful');
										const blob = new Blob([xhr.response], { type });
										const url = URL.createObjectURL(blob);

										audio.src = url;
										audio.removeAttribute('data-loading');

										const currentTiddler = audio.closest('[data-tiddler-title]');
										if (currentTiddler) {
											const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
											const savedTime = $tw.wiki.getTiddler(tiddlerTitle)
												?.fields[getAudioTimestampField(audio)];
											if (savedTime) {
												audio.currentTime = parseFloat(savedTime);
											}
										}
									}
								};

								xhr.onerror = function (error) {
									Debug.error('XHR error occurred, retrying...', error);
									if (retryCount < 3) {
										setTimeout(() => loadAudio(retryCount + 1), 1000 * Math.pow(2, retryCount));
									}
								};

								xhr.send();
							};

							loadAudio();
						}
					});
				}, 100);
			});
		}

		this.tree = [element];
		this.type = type;
	};

	exports["audio/ogg"] = AudioParser;
	exports["audio/mpeg"] = AudioParser;
	exports["audio/mp3"] = AudioParser;
	exports["audio/mp4"] = AudioParser;

})();