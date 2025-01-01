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

	// Add helper function at top
	function getVideoTimestampField(video) {
		const sourceElement = video.querySelector('source');
		let originalSrc = sourceElement ? sourceElement.getAttribute('src') : video.getAttribute('src');
		if (originalSrc.startsWith('data:')) {
			originalSrc = originalSrc.substring(originalSrc.indexOf('base64,') + 7);
		}
		let hash = 0;
		for (let i = 0; i < originalSrc.length; i++) {
			hash = ((hash << 5) - hash) + originalSrc.charCodeAt(i);
			hash = hash & hash;
		}
		return `video-timestamp-${Math.abs(hash)}`;
	}

	// Add performance monitoring and cache management
	const MEMORY_LIMIT = 100 * 1024 * 1024; // 100MB limit
	const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
	const BUFFER_AHEAD = 3; 

	class ChunkCache {
		constructor() {
			this.chunks = new Map();
			this.totalSize = 0;
			this.lastAccessed = new Map();
		}

		set(key, value) {
			const size = value.byteLength;
			while (this.totalSize + size > MEMORY_LIMIT && this.chunks.size > 0) {
				const oldest = [...this.lastAccessed.entries()]
					.sort((a, b) => a[1] - b[1])[0][0];
				this.delete(oldest);
			}
			this.chunks.set(key, value);
			this.lastAccessed.set(key, Date.now());
			this.totalSize += size;
		}

		get(key) {
			if (this.chunks.has(key)) {
				this.lastAccessed.set(key, Date.now());
				return this.chunks.get(key);
			}
			return null;
		}

		delete(key) {
			const chunk = this.chunks.get(key);
			if (chunk) {
				this.totalSize -= chunk.byteLength;
				this.chunks.delete(key);
				this.lastAccessed.delete(key);
			}
		}
	}

	const chunkCache = new ChunkCache();

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
			const processedVideos = new WeakMap();
			const bufferThreshold = 0.1; // 10% buffered before play

			$tw.hooks.addHook("th-page-refreshed", function () {
				setTimeout(function () {
					Array.from(document.getElementsByClassName("tw-video-element")).forEach(function (video) {
						if (!video.dataset.initialized) {
							video.dataset.initialized = "true";

							// Only add timestamp listeners after video is buffered and ready
							video.addEventListener('canplay', function () {
								// Restore timestamp
								const currentTiddler = video.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									const savedTime = $tw.wiki.getTiddler(tiddlerTitle)?.fields[getVideoTimestampField(video)];
									if (savedTime) video.currentTime = parseFloat(savedTime);
								}

								// Add timestamp saving on pause
								video.addEventListener('pause', function () {
									const currentTiddler = video.closest('[data-tiddler-title]');
									if (currentTiddler) {
										const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
										const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
										if (tiddler) {
											$tw.wiki.addTiddler(
												new $tw.Tiddler(tiddler, {
													[getVideoTimestampField(video)]: video.currentTime.toString()
												}),
												{ suppressUpdate: true, quiet: true }
											);
										}
									}
								});
							}, { once: true });

							// Continue with existing buffering code
							if (processedVideos.has(video)) return;

							// Create loading overlay
							const overlay = document.createElement('div');
							overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:white;';
							overlay.innerHTML = 'Loading 0%';
							video.parentNode.style.position = 'relative';
							video.parentNode.appendChild(overlay);

							video.preload = "auto";
							video.autobuffer = true;

							// Prevent play until buffered
							video.addEventListener('play', function (e) {
								if (video.buffered.length === 0 || (video.buffered.end(0) / video.duration) < bufferThreshold) {
									console.log('Waiting for buffer...');
									video.pause();
								}
							}, { passive: true });

							// Monitor buffering
							video.addEventListener('progress', function () {
								if (video.buffered.length > 0) {
									const progress = (video.buffered.end(0) / video.duration * 100).toFixed(2);
									console.log(`Buffer: ${progress}%`);
									
									// Adaptive buffer threshold
									const networkSpeed = navigator.connection?.downlink || 10;
									const adaptiveThreshold = Math.max(0.1, Math.min(0.3, 1 / networkSpeed));
									
									if ((video.buffered.end(0) / video.duration) >= adaptiveThreshold) {
										overlay.style.display = 'none';
									}
									
									// Preload next chunks
									const currentTime = video.currentTime;
									const chunksNeeded = Math.ceil((currentTime + 30) / CHUNK_SIZE); // 30s ahead
									loadChunks(video.currentSrc, chunksNeeded);
								}
							}, { passive: true });

							const xhr = new XMLHttpRequest();
							xhr.open('GET', video.currentSrc, true);
							xhr.responseType = 'blob';

							// Add range support
							xhr.setRequestHeader('Range', 'bytes=0-');
							xhr.setRequestHeader('Cache-Control', 'no-cache');
							xhr.setRequestHeader('Pragma', 'no-cache');

							if ('connection' in navigator) {
								const connectionSpeed = navigator.connection?.downlink || 10;
								const initialChunkSize = Math.min(CHUNK_SIZE, connectionSpeed * 1024 * 100);
								xhr.setRequestHeader('Range', `bytes=0-${initialChunkSize}`);
							}

							// Improved progress tracking
							xhr.onprogress = function (e) {
								if (e.lengthComputable) {
									const progress = (e.loaded / e.total * 100).toFixed(2);
									console.log(`Download: ${progress}%`);
									
									if (overlay) {
										overlay.innerHTML = `Loading ${progress}%`;
										if (progress > (bufferThreshold * 100)) {
											overlay.style.display = 'none';
										}
									}
								}
							};

							xhr.onload = function () {
								if (xhr.status === 200 || xhr.status === 206) {
									const blob = new Blob([xhr.response], { type: video.type || 'video/mp4' });
									const url = URL.createObjectURL(blob);
									video._blob = blob;
									video.src = url;
									processedVideos.set(video, {
										blob: blob,
										url: url
									});

									// Add timestamp restoration after buffering
									video.addEventListener('canplaythrough', function() {
										const currentTiddler = video.closest('[data-tiddler-title]');
										if (currentTiddler) {
											const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
											const savedTime = $tw.wiki.getTiddler(tiddlerTitle)?.fields[getVideoTimestampField(video)];
											if (savedTime) {
												video.currentTime = parseFloat(savedTime);
											}
										}
									}, { once: true });

									// Handle seeking with passive listener
									video.addEventListener('seeking', function () {
										if (!video.src || video.src === '') {
											video.src = URL.createObjectURL(video._blob);
										}
									}, { passive: true });

									// Cleanup
									const observer = new MutationObserver(function (mutations) {
										mutations.forEach(function (mutation) {
											if ([...mutation.removedNodes].includes(video)) {
												URL.revokeObjectURL(url);
												processedVideos.delete(video);
												observer.disconnect();
												if (overlay.parentNode) {
													overlay.parentNode.removeChild(overlay);
												}
											}
										});
									});

									observer.observe(video.parentNode, {
										childList: true,
										subtree: true
									});
								}
							};

							xhr.send();

							video.addEventListener('loadedmetadata', async () => {
								requestAnimationFrame(async () => {
									const xhr = new XMLHttpRequest();
									// Encode the URL to handle spaces and special characters
									const encodedUrl = encodeURI(video.currentSrc);
									xhr.open('HEAD', encodedUrl);

									xhr.onload = () => {
										const observer = new MutationObserver((mutations) => {
											requestAnimationFrame(() => {
												mutations.forEach((mutation) => {
													if (mutation.addedNodes.length) {
														const overlay = mutation.target.querySelector('.play-overlay');
														if (overlay) {
															overlay.parentNode.removeChild(overlay);
														}
													}
												});
											});
										});

										observer.observe(video.parentNode, {
											childList: true,
											subtree: true
										});
									};

									xhr.send();
								});
							}, { passive: true });

							// Add to VideoParser initialization
							const metrics = {
								bufferCount: 0,
								droppedFrames: 0,
								loadTime: 0
							};

							video.addEventListener('progress', function() {
								if (video.buffered.length > 0) {
									// Dynamic chunk size based on network conditions
									const networkSpeed = navigator.connection?.downlink || 10;
									const dynamicChunkSize = Math.min(
										CHUNK_SIZE * 2,
										Math.max(CHUNK_SIZE / 2, networkSpeed * 100 * 1024)
									);

									// Predictive loading based on playback patterns
									const currentChunk = Math.floor(video.currentTime / (dynamicChunkSize / 1024 / 1024));
									const playbackRate = video.playbackRate;
									const predictedChunks = Math.ceil(playbackRate * BUFFER_AHEAD);

									loadChunks(video.currentSrc, currentChunk + predictedChunks, dynamicChunkSize);
									
									// Track performance
									metrics.bufferCount++;
									requestAnimationFrame(() => {
										if (video.getVideoPlaybackQuality) {
											metrics.droppedFrames = video.getVideoPlaybackQuality().droppedVideoFrames;
										}
									});
								}
							}, { passive: true });

							// Monitor memory usage
							setInterval(() => {
								if (performance.memory) {
									const memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024;
									if (memoryUsage > 90) {
										chunkCache.chunks.clear();
										chunkCache.totalSize = 0;
										chunkCache.lastAccessed.clear();
									}
								}
							}, 30000);
						}
					});
				}, 100);
			}, { passive: true });
		}

		this.tree = [element];
		this.type = type;
	};

	// Optimized chunk loading
	async function loadChunks(src, endChunk, dynamicChunkSize = CHUNK_SIZE) {
		for (let i = 0; i < endChunk; i++) {
			if (!chunkCache.has(`${src}-${i}`)) {
				const start = i * dynamicChunkSize;
				const end = start + dynamicChunkSize;
				
				const xhr = new XMLHttpRequest();
				xhr.open('GET', src, true);
				xhr.responseType = 'arraybuffer';
				xhr.setRequestHeader('Range', `bytes=${start}-${end}`);
				
				xhr.onload = function() {
					if (xhr.status === 206) {
						chunkCache.set(`${src}-${i}`, xhr.response);
						
						// Cleanup old chunks
						if (chunkCache.size > BUFFER_AHEAD * 2) {
							const oldestChunk = Math.floor(video.currentTime / CHUNK_SIZE) - BUFFER_AHEAD;
							chunkCache.delete(`${src}-${oldestChunk}`);
						}
					}
				};
				
				xhr.send();
			}
		}
	}

	exports["video/ogg"] = VideoParser;
	exports["video/webm"] = VideoParser;
	exports["video/mp4"] = VideoParser;
	exports["video/quicktime"] = VideoParser;

})();
