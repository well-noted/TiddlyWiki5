/*\
title: $:/core/modules/parsers/audiocontrols.js
type: application/javascript
module-type: library
\*/

(function () {
	"use strict";

	class AudioControls {
		constructor() {
			this.createOverlay();
			this.initializeMediaSession();
			this.attachEventListeners();

			// Add scroll position tracking
			window.addEventListener('scroll', () => {
				requestAnimationFrame(() => {
					const viewportHeight = window.innerHeight;
					const scrollPosition = window.scrollY;
					const documentHeight = document.documentElement.scrollHeight;

					// Calculate position relative to viewport
					const bottomOffset = Math.min(
						20, // minimum offset from bottom
						viewportHeight - (documentHeight - scrollPosition - viewportHeight)
					);

					this.overlay.style.position = 'fixed';
					this.overlay.style.bottom = `${bottomOffset}px`;
				});
			}, { passive: true });
		}

		createOverlay() {
			this.overlay = document.createElement('div');
			this.overlay.id = 'audio-controls-overlay';
			this.overlay.innerHTML = `
        <div class="audio-controls-content">
            <button id="close-overlay" class="close-button">×</button>
            <div class="audio-info">
                <div id="audio-title"></div>
                <div id="audio-time">
                    <span id="current-time">0:00</span> / 
                    <span id="duration">0:00</span>
                </div>
            </div>
            <div class="audio-progress">
                <div id="progress-bar">
                    <div id="progress-current"></div>
                </div>
            </div>
            <div class="audio-controls">
                <button id="prev-button" class="tc-btn-invisible">⏮️</button>
                <button id="play-button" class="tc-btn-invisible">▶️</button>
                <button id="next-button" class="tc-btn-invisible">⏭️</button>
            </div>
        </div>
    `;
			document.body.appendChild(this.overlay);

			// Cache DOM elements
			this.elements = {
				title: document.getElementById('audio-title'),
				currentTime: document.getElementById('current-time'),
				duration: document.getElementById('duration'),
				progressBar: document.getElementById('progress-bar'),
				progressCurrent: document.getElementById('progress-current'),
				playButton: document.getElementById('play-button'),
				prevButton: document.getElementById('prev-button'),
				nextButton: document.getElementById('next-button'),
				closeButton: document.getElementById('close-overlay')
			};

			// Add close button handler
			this.elements.closeButton.addEventListener('click', () => {
				this.overlay.classList.remove('active');
			});

			// Add continuous time updates
			setInterval(() => {
				if (this.currentAudio && !this.currentAudio.paused) {
					this.updateProgress();
				}
			}, 100);
		}

		initializeMediaSession() {
			if ('mediaSession' in navigator) {
				navigator.mediaSession.setActionHandler('play', () => {
					this.currentAudio?.play();
				});

				navigator.mediaSession.setActionHandler('pause', () => {
					this.currentAudio?.pause();
				});

				navigator.mediaSession.setActionHandler('previoustrack', () => {
					if (this.currentAudio) {
						this.currentAudio.currentTime = Math.max(0, this.currentAudio.currentTime - 10);
					}
				});

				navigator.mediaSession.setActionHandler('nexttrack', () => {
					if (this.currentAudio) {
						this.currentAudio.currentTime = Math.min(
							this.currentAudio.duration,
							this.currentAudio.currentTime + 10
						);
					}
				});
			}
		}

		attachEventListeners() {
			// Listen for audio element creation
			const observer = new MutationObserver(mutations => {
				mutations.forEach(mutation => {
					mutation.addedNodes.forEach(node => {
						if (node.nodeName === 'AUDIO') {
							this.setupAudioElement(node);
						}
					});
				});
			});

			observer.observe(document.body, {
				childList: true,
				subtree: true
			});

			// Control button listeners
			this.elements.playButton.addEventListener('click', () => {
				if (this.currentAudio?.paused) {
					this.currentAudio.play();
				} else {
					this.currentAudio?.pause();
				}
			});

			this.elements.prevButton.addEventListener('click', () => {
				if (this.currentAudio) {
					this.currentAudio.currentTime = Math.max(0, this.currentAudio.currentTime - 10);
				}
			});

			this.elements.nextButton.addEventListener('click', () => {
				if (this.currentAudio) {
					this.currentAudio.currentTime = Math.min(
						this.currentAudio.duration,
						this.currentAudio.currentTime + 10
					);
				}
			});

			// Progress bar interaction
			this.elements.progressBar.addEventListener('click', (e) => {
				if (this.currentAudio) {
					const rect = this.elements.progressBar.getBoundingClientRect();
					const pos = (e.clientX - rect.left) / rect.width;
					this.currentAudio.currentTime = this.currentAudio.duration * pos;
				}
			});
		}

		setupAudioElement(audio) {
			audio.addEventListener('play', () => {
				this.currentAudio = audio;
				this.updateOverlay();
				this.overlay.classList.add('active');
				if (this.elements.playButton) {
					this.elements.playButton.textContent = '⏸️';
				}
			});

			audio.addEventListener('pause', () => {
				if (this.elements.playButton) {
					this.elements.playButton.textContent = '▶️';
				}
			});

			audio.addEventListener('timeupdate', () => {
				requestAnimationFrame(() => this.updateProgress());
			});

			audio.addEventListener('loadedmetadata', () => {
				this.updateDuration();
			});
		}

		updateOverlay() {
			if (this.currentAudio) {
				const tiddler = this.currentAudio.closest('[data-tiddler-title]');
				this.elements.title.textContent = tiddler ?
					tiddler.getAttribute('data-tiddler-title') :
					'Audio';
				this.updateProgress();
				this.updateDuration();
			}
		}

		updateProgress() {
			if (this.currentAudio) {
				const currentTime = this.formatTime(this.currentAudio.currentTime);
				this.elements.currentTime.textContent = currentTime;

				const progress = (this.currentAudio.currentTime / this.currentAudio.duration) * 100;
				this.elements.progressCurrent.style.width = `${progress}%`;
			}
		}

		updateDuration() {
			if (this.currentAudio) {
				const duration = this.formatTime(this.currentAudio.duration);
				this.elements.duration.textContent = duration;
			}
		}

		formatTime(seconds) {
			if (!seconds) return '0:00';
			const mins = Math.floor(seconds / 60);
			const secs = Math.floor(seconds % 60);
			return `${mins}:${secs.toString().padStart(2, '0')}`;
		}
	}

	// Initialize when document is ready
	if ($tw.browser) {
		$tw.hooks.addHook("th-page-refreshed", function () {
			if (!window.audioControls) {
				window.audioControls = new AudioControls();
			}
		});
	}
})();