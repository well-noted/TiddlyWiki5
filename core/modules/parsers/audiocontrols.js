/*\
title: $:/core/modules/parsers/audiocontrols.js
type: application/javascript
module-type: library
\*/

(function () {
	"use strict";

	class AudioControls {
		constructor() {
			console.log("AudioControls: Initializing...");
			this.createOverlay();
			this.initializeMediaSession();
			this.attachEventListeners();

			// Add state monitoring
			this.stateMonitorInterval = setInterval(() => {
				if (this.currentAudio) {
					this.updatePlayPauseState();
				}
			}, 100); // Check every 100ms

			// Add scroll position tracking
			window.addEventListener('scroll', () => {
				requestAnimationFrame(() => {
					const viewportHeight = window.innerHeight;
					const scrollPosition = window.scrollY;

					// Calculate position relative to viewport for both mobile and desktop
					this.overlay.style.position = 'absolute';
					this.overlay.style.top = `${scrollPosition + viewportHeight - this.overlay.offsetHeight}px`;

					// Keep horizontal positioning based on screen size
					if (window.innerWidth >= 768) {
						// Desktop
						this.overlay.style.left = '50%';
						this.overlay.style.transform = 'translateX(-50%)';
					} else {
						// Mobile
						this.overlay.style.left = '0';
						this.overlay.style.transform = 'none';
					}
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

			// In createOverlay(), after creating this.overlay
			let isDragging = false;
			let currentX;
			let currentY;
			let initialX;
			let initialY;
			let xOffset = 0;
			let yOffset = 0;

			const isMobile = () => window.innerWidth < 768;

			const dragStart = (e) => {
				if (isMobile()) return; // Disable dragging on mobile

				if (e.type === "mousedown") {
					initialX = e.clientX - xOffset;
					initialY = e.clientY - yOffset;
				} else {
					initialX = e.touches[0].clientX - xOffset;
					initialY = e.touches[0].clientY - yOffset;
				}

				if (e.target === this.overlay || e.target.closest('.audio-controls-content')) {
					isDragging = true;
				}
			};

			const drag = (e) => {
				if (isMobile() || !isDragging) return; // Disable dragging on mobile
				if (isDragging) {
					e.preventDefault();

					if (e.type === "mousemove") {
						currentX = e.clientX - initialX;
						currentY = e.clientY - initialY;
					} else {
						currentX = e.touches[0].clientX - initialX;
						currentY = e.touches[0].clientY - initialY;
					}

					xOffset = currentX;
					yOffset = currentY;

					setTranslate(currentX, currentY, this.overlay);
				}
			};

			const dragEnd = () => {
				isDragging = false;
			};

			const setTranslate = (xPos, yPos, el) => {
				el.style.transform = `translate(${xPos}px, ${yPos}px)`;
			};

			// Add desktop event listeners
			this.overlay.addEventListener('mousedown', dragStart);
			document.addEventListener('mousemove', drag);
			document.addEventListener('mouseup', dragEnd);

			// Add mobile event listeners
			this.overlay.addEventListener('touchstart', dragStart);
			document.addEventListener('touchmove', drag);
			document.addEventListener('touchend', dragEnd);

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
			this.elements.closeButton.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();

				console.log("Close button clicked");

				// Pause the audio if it's playing
				if (this.currentAudio && !this.currentAudio.paused) {
					this.currentAudio.pause();
				}

				// Remove active class and reset styles
				this.overlay.style.opacity = '0';
				this.overlay.style.pointerEvents = 'none';
				this.overlay.classList.remove('active');

				// Reset current audio
				this.currentAudio = null;

				// Force a reflow
				void this.overlay.offsetWidth;
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
					this.elements.playButton.innerHTML = '⏸️';
				} else {
					this.currentAudio?.pause();
					this.elements.playButton.innerHTML = '▶️';
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

		updatePlayPauseState() {
			if (!this.currentAudio || !this.elements.playButton) return;

			console.log("Updating play/pause state:", this.currentAudio.paused ? "paused" : "playing");
			this.elements.playButton.innerHTML = this.currentAudio.paused ? '▶️' : '⏸️';
		}

		setupAudioElement(audio) {
			console.log("Setting up new audio element");

			audio.addEventListener('play', () => {
				console.log("Audio play event triggered");
				this.currentAudio = audio;
				this.updateOverlay();
				// Show overlay only when first playing
				if (!this.overlay.classList.contains('active')) {
					this.overlay.classList.add('active');
				}
				if (this.elements.playButton) {
					this.elements.playButton.innerHTML = '⏸️';
				}
			});

			// Modified pause event listener - only update button state
			audio.addEventListener('pause', () => {
				console.log("Audio pause event triggered");
				if (this.elements.playButton) {
					this.elements.playButton.innerHTML = '▶️';
				}
				// Remove any code that affects overlay visibility
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

		destroy() {
			if (this.stateMonitorInterval) {
				clearInterval(this.stateMonitorInterval);
			}
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