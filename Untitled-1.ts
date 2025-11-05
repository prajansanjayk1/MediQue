<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MediQueue - Patient Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js"></script>
    <style>
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
            animation: fadeIn 0.3s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: linear-gradient(to bottom, #3b82f6, #8b5cf6);
            border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(to bottom, #2563eb, #7c3aed);
        }
        body {
            background: linear-gradient(to bottom right, #f8fafc, #e0e7ff);
            min-height: 100vh;
        }
        /* Style for the active bottom nav item */
        .bottom-nav-active {
            color: #2563eb; /* blue-600 */
        }
        .bottom-nav-active svg {
            transform: scale(1.1);
        }
    </style>
    <script type="module">
        // Firebase Imports
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import {
            getAuth,
            setPersistence,
            browserLocalPersistence,
            onAuthStateChanged,
            updateProfile,
            signOut
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import {
            getFirestore,
            collection,
            addDoc,
            query,
            where,
            onSnapshot,
            serverTimestamp,
            doc,
            setDoc,
            getDoc,
            orderBy,
            Timestamp
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- App Configuration ---
        const firebaseConfig = {
          apiKey: "AIzaSyDqdSzRr29kDUH-eDwXTSg_dImTOqyYCiU",
          authDomain: "main-8c336.firebaseapp.com",
          projectId: "main-8c336",
          storageBucket: "main-8c336.firebasestorage.app",
          messagingSenderId: "507656529909",
          appId: "1:507656529909:web:ccea008f4a1178bf0da2bc",
          measurementId: "G-RX4KHQRQMJ"
        };
        const appId = firebaseConfig.projectId;
        
        let CLINIC_COORDS = { latitude: 12.94320783333333, longitude: 80.15839316666666 };
        let MAX_DISTANCE_METERS = 100000;
        const ADMIN_EMAIL = "prajansanjayko@gmail.com";

        // --- Initialization ---
        window.onload = async () => {

            let app, db, auth;
            let patientApp;
            let patientPages = {};

            // --- Navigation Elements ---
            let mainNav, authControls, userDisplay, logoutBtn; // Simplified top nav
            
            // --- Bottom Nav Elements ---
            let bottomNav, bottomNavBook, bottomNavAppointments, bottomNavHistory, bottomNavProfile;
            let bottomNavItems = []; 

            // Patient: Live Queue (Book)
            let distanceEl, geoStatusEl, bookingForm, joinQueueBtn, patientNameInput, patientMobileInput, patientIssueInput;
            let queueStatusSection, queueMessageEl, queueNumberEl, queueEstimateEl, queueClosedMsg;

            // Patient: Visit History
            let historyList, historyMsg;

            // Patient: Appointments
            let aptDateInput, aptTimeSelect, aptReasonInput, aptBookBtn, myAptList, myAptMsg;

            // Patient: Profile
            let profileNameInput, profileMobileInput, profileUpdateBtn, profileMsg, mobileLogoutBtn;
            
            let loadingOverlay, modal, modalMessage, modalCloseBtn;

            // App State
            let currentUserId = null, currentUserEmail = null, currentUserDisplayName = null;
            let isAuthReady = false;
            let myQueueUnsubscribe = null, historyUnsubscribe = null, clinicStatusUnsubscribe = null;
            let patientQueueCountUnsubscribe = null, myAppointmentsUnsubscribe = null, profileUnsubscribe = null;
            
            let currentDailyLimit = 999; 
            let geoWatchId = null;
            let hasPlayedSound = false;
            let notificationSynth = null;
            
            // --- NEW STATE VARIABLES TO FIX RACE CONDITION ---
            let isClinicFull = false;
            let isInQueue = false;
            
            // --- Initialize Firebase ---
            try {
                app = initializeApp(firebaseConfig);
                db = getFirestore(app);
                auth = getAuth(app);
                await setPersistence(auth, browserLocalPersistence);
            } catch (error) {
                console.error("Firebase Init Error:", error);
                showModal("Error initializing app. Please check your Firebase config and refresh.");
                return;
            }

            // --- 1. Geolocation Logic ---

            function getDistance(lat1, lon1, lat2, lon2) {
                const R = 6371e3;
                const φ1 = lat1 * Math.PI / 180;
                const φ2 = lat2 * Math.PI / 180;
                const Δφ = (lat2 - lat1) * Math.PI / 180;
                const Δλ = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                          Math.cos(φ1) * Math.cos(φ2) *
                          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }
            
            // --- 1.A: Geolocation Success (FIXED) ---
            // This function ONLY updates status text and the button. It does NOT show/hide the form.
            function onGeoSuccess(position) {
                const { latitude, longitude } = position.coords;
                const distance = getDistance(latitude, longitude, CLINIC_COORDS.latitude, CLINIC_COORDS.longitude);

                if (distanceEl) distanceEl.textContent = `${distance.toFixed(0)} meters`;

                if (distance <= MAX_DISTANCE_METERS) {
                    if (geoStatusEl) {
                        geoStatusEl.textContent = "You are in range!";
                        geoStatusEl.className = "text-lg font-medium text-emerald-600";
                    }
                    if (joinQueueBtn) joinQueueBtn.disabled = false;
                } else {
                    if (geoStatusEl) {
                        geoStatusEl.textContent = `You are too far away. Move within ${MAX_DISTANCE_METERS}m of the clinic to join the queue.`;
                        geoStatusEl.className = "text-lg font-medium text-red-600";
                    }
                    if (joinQueueBtn) joinQueueBtn.disabled = true;
                }
                if (loadingOverlay) loadingOverlay.style.display = 'none';
            }
            
            async function loadClinicSettings() {
                if (!db) return;
                try {
                    const settingsRef = doc(db, `artifacts/${appId}/public/data/clinicSettings/settings`);
                    const settingsDoc = await getDoc(settingsRef);
                    if (settingsDoc.exists()) {
                        const data = settingsDoc.data();
                        if (data.latitude && data.longitude) {
                            CLINIC_COORDS.latitude = parseFloat(data.latitude);
                            CLINIC_COORDS.longitude = parseFloat(data.longitude);
                        }
                        if (data.maxDistanceMeters) {
                            MAX_DISTANCE_METERS = parseInt(data.maxDistanceMeters);
                        }
                    }
                } catch (error) {
                    console.error("Error loading clinic settings:", error);
                }
            }
            
            // --- 1.B: Geolocation Error (FIXED) ---
            // This function ONLY updates status text and the button. It does NOT show/hide the form.
            function onGeoError(error) {
                console.error("Geolocation Error:", error.message);
                if (geoStatusEl) {
                    geoStatusEl.textContent = `Could not get location: ${error.message}. Please enable location permissions to join the queue.`;
                    geoStatusEl.className = "text-lg font-medium text-red-600";
                }
                if (joinQueueBtn) joinQueueBtn.disabled = true;
                if (loadingOverlay) loadingOverlay.style.display = 'none';
            }

            // --- 1.C: Start Geolocation (FIXED) ---
            // This function NO LONGER shows the form.
            function startGeolocationWatch() {
                if (!navigator.geolocation) {
                    if (geoStatusEl) geoStatusEl.textContent = "Geolocation is not supported by your browser.";
                    if (joinQueueBtn) joinQueueBtn.disabled = true;
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                    return;
                }
                if (geoStatusEl) geoStatusEl.textContent = "Checking your location...";
                if (loadingOverlay) loadingOverlay.style.display = 'flex';

                const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
                geoWatchId = navigator.geolocation.watchPosition(onGeoSuccess, onGeoError, options);
            }

            function stopGeolocationWatch() {
                if (geoWatchId && navigator.geolocation) {
                    navigator.geolocation.clearWatch(geoWatchId);
                    geoWatchId = null;
                }
            }

            // --- 2. Authentication Logic ---
            async function handleLogout() {
                await signOut(auth);
                window.location.href = 'index.html'; // Redirect to login page
            }
            
            // --- NEW: Central UI Update Function ---
            function updateHomeUI() {
                if (isInQueue) {
                    // 1. USER IS IN THE QUEUE
                    if (bookingForm) bookingForm.style.display = 'none';
                    if (queueClosedMsg) queueClosedMsg.style.display = 'none';
                    if (queueStatusSection) queueStatusSection.style.display = 'block';
                    stopGeolocationWatch(); // Don't need location anymore
                } else if (isClinicFull) {
                    // 2. USER IS NOT IN QUEUE, BUT CLINIC IS FULL
                    if (bookingForm) bookingForm.style.display = 'none';
                    if (queueStatusSection) queueStatusSection.style.display = 'none';
                    if (queueClosedMsg) queueClosedMsg.style.display = 'block';
                    stopGeolocationWatch(); // Don't need location anymore
                } else {
                    // 3. USER IS NOT IN QUEUE, CLINIC IS OPEN
                    if (queueStatusSection) queueStatusSection.style.display = 'none';
                    if (queueClosedMsg) queueClosedMsg.style.display = 'none';
                    if (bookingForm) bookingForm.style.display = 'block';
                    startGeolocationWatch(); // NOW we need location
                }
            }

            // --- 3. Page Navigation Logic (FIXED) ---
            function showPatientView(pageId) {
                if (!patientApp) return;
                patientApp.style.display = 'block';

                Object.values(patientPages).forEach(page => page.style.display = 'none');
                if (patientPages[pageId]) {
                    patientPages[pageId].style.display = 'block';
                }

                // Clear all active states from bottom nav
                bottomNavItems.forEach(btn => btn?.classList.remove('bottom-nav-active'));

                // Stop all listeners
                stopGeolocationWatch();
                if (clinicStatusUnsubscribe) clinicStatusUnsubscribe();
                if (patientQueueCountUnsubscribe) patientQueueCountUnsubscribe();
                if (myQueueUnsubscribe) myQueueUnsubscribe();
                if (historyUnsubscribe) historyUnsubscribe();
                if (myAppointmentsUnsubscribe) myAppointmentsUnsubscribe();
                if (profileUnsubscribe) profileUnsubscribe();

                // Set active states and start listeners for the current page
                if (pageId === 'book') {
                    bottomNavBook?.classList.add('bottom-nav-active');
                    requestNotificationPermission();
                    
                    // --- NEW, STABLE LOGIC ---
                    // Set defaults
                    isInQueue = false;
                    isClinicFull = false;
                    updateHomeUI(); // Show the form immediately by default
                    
                    // Start listeners to update the state
                    attachClinicStatusListener(); 
                    attachPatientQueueListener();
                    
                } else if (pageId === 'history') {
                    bottomNavHistory?.classList.add('bottom-nav-active');
                    attachHistoryListener();
                } else if (pageId === 'appointments') {
                    bottomNavAppointments?.classList.add('bottom-nav-active');
                    attachMyAppointmentListener();
                } else if (pageId === 'profile') {
                    bottomNavProfile?.classList.add('bottom-nav-active');
                    attachProfileListener();
                }
            }

            // --- 4. Patient: Live Queue (Book) Logic ---

            function requestNotificationPermission() {
                if ("Notification" in window && Notification.permission !== "denied") {
                    Notification.requestPermission();
                }
            }

            function playNotificationSound() {
                if (hasPlayedSound) return;
                if (!notificationSynth) {
                    notificationSynth = new Tone.Synth().toDestination();
                }
                Tone.start().then(() => {
                    notificationSynth.triggerAttackRelease("C5", "8n", Tone.now());
                    notificationSynth.triggerAttackRelease("G5", "8n", Tone.now() + 0.2);
                });
                hasPlayedSound = true;
            }

            function showTurnNotification() {
                if (Notification.permission === "granted") {
                    new Notification("It's your turn at MediQueue!", {
                        body: "Please proceed to the doctor's room.",
                        icon: "/logo.jpg" // Make sure you have this icon
                    });
                }
            }

            function attachClinicStatusListener() {
                if (!isAuthReady || !db) return;
                const statusRef = doc(db, `artifacts/${appId}/public/data/clinicSettings/settings`);
                if (clinicStatusUnsubscribe) clinicStatusUnsubscribe(); 
                clinicStatusUnsubscribe = onSnapshot(statusRef, (docSnap) => {
                    currentDailyLimit = (docSnap.exists() && docSnap.data().dailyLimit !== undefined) ? parseInt(docSnap.data().dailyLimit) : 999;
                    if(isNaN(currentDailyLimit)) currentDailyLimit = 999;
                    attachPatientQueueCountListener();
                }, (error) => {
                    console.error("[Patient] Error listening to clinic status:", error);
                    currentDailyLimit = 999;
                    attachPatientQueueCountListener();
                });
            }

            // --- 4.A: Queue Count Listener (FIXED) ---
            // This function ONLY handles the "Clinic Full" message.
            function attachPatientQueueCountListener() {
                if (!isAuthReady || !db) return;
                if (patientQueueCountUnsubscribe) patientQueueCountUnsubscribe();

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                const q = query(collection(db, `artifacts/${appId}/public/data/queue`),
                                where("joinedAt", ">=", Timestamp.fromDate(today)),
                                where("joinedAt", "<", Timestamp.fromDate(tomorrow))
                                );
                patientQueueCountUnsubscribe = onSnapshot(q, (querySnapshot) => {
                    const currentCount = querySnapshot.size;
                    if (currentCount >= currentDailyLimit) {
                        isClinicFull = true;
                    } else {
                        isClinicFull = false;
                    }
                    updateHomeUI(); // Update UI based on new state
                }, (error) => {
                    console.error("[Patient] Error getting patient queue count:", error);
                    isClinicFull = false; // Default to open on error
                    updateHomeUI();
                });
            }

            async function joinQueue(e) {
                e.preventDefault();
                const name = patientNameInput.value.trim();
                const mobile = patientMobileInput.value.trim();
                const issue = patientIssueInput.value.trim();

                if (!name || !issue || !mobile) {
                    showModal("Please fill in your name, mobile, and reason for visit.");
                    return;
                }

                if (joinQueueBtn) {
                    joinQueueBtn.disabled = true;
                    joinQueueBtn.textContent = 'Joining...';
                }

                try {
                    await Tone.start();
                    const queueCollectionPath = `artifacts/${appId}/public/data/queue`;
                    await addDoc(collection(db, queueCollectionPath), {
                        name: name,
                        mobile: mobile,
                        issue: issue,
                        patientId: currentUserId,
                        status: 'waiting',
                        joinedAt: serverTimestamp()
                    });

                    // No need to show/hide form here, the listener will do it
                    if (patientIssueInput) patientIssueInput.value = '';
                    hasPlayedSound = false;

                } catch (error) {
                    console.error("Error joining queue:", error);
                    showModal("Could not join the queue. Please try again.");
                } finally {
                    if (joinQueueBtn) {
                        joinQueueBtn.disabled = false;
                        joinQueueBtn.textContent = 'Join Queue';
                    }
                }
            }
            
            // --- 4.B: Patient Queue Listener (FIXED) ---
            // This function now just updates state and lets updateHomeUI() do the work.
            function attachPatientQueueListener() {
                if (!isAuthReady || !db || !currentUserId) return;
                
                const q = query(collection(db, `artifacts/${appId}/public/data/queue`),
                                where("status", "==", "waiting"),
                                orderBy("joinedAt", "asc"));

                myQueueUnsubscribe = onSnapshot(q, (querySnapshot) => {
                    if (!isAuthReady) return;
                    let patientQueue = [];
                    querySnapshot.forEach((doc) => patientQueue.push(doc));
                    
                    const myIndex = patientQueue.findIndex(doc => doc.data().patientId === currentUserId);

                    if (myIndex !== -1) {
                        // --- USER IS IN THE QUEUE ---
                        isInQueue = true;
                        if (queueStatusSection) queueStatusSection.classList.add('active');
                        
                        const myQueueNumber = myIndex + 1;
                        const estimate = myIndex * 5; 
                        if (queueEstimateEl) queueEstimateEl.textContent = `~ ${estimate} min wait`;

                        if (myQueueNumber === 1) {
                            if (queueMessageEl) queueMessageEl.textContent = "It's your turn!";
                            if (queueNumberEl) queueNumberEl.textContent = "Proceed to Doctor";
                            if (queueEstimateEl) queueEstimateEl.textContent = "You are next!";
                            if (queueStatusSection) {
                                queueStatusSection.classList.remove('from-blue-500', 'to-indigo-600');
                                queueStatusSection.classList.add('from-emerald-500', 'to-teal-600', 'animate-pulse');
                            }
                            playNotificationSound();
                            showTurnNotification();
                        } else {
                            if (queueMessageEl) queueMessageEl.textContent = "Your position in queue:";
                            if (queueNumberEl) queueNumberEl.textContent = `#${myQueueNumber}`;
                            if (queueStatusSection) {
                                queueStatusSection.classList.add('from-blue-500', 'to-indigo-600');
                                queueStatusSection.classList.remove('from-emerald-500', 'to-teal-600', 'animate-pulse');
                            }
                            hasPlayedSound = false;
                        }
                    } else {
                        // --- USER IS NOT IN THE QUEUE ---
                        isInQueue = false;
                        if (queueStatusSection) queueStatusSection.classList.remove('active');
                        hasPlayedSound = false;
                    }
                    updateHomeUI(); // Update UI based on new state
                }, (error) => {
                    console.error("Error with patient queue snapshot:", error);
                });
            }
            // --- END OF FIX ---


            // --- 5. Patient: Visit History Logic ---

            function attachHistoryListener() {
                if (!isAuthReady || !db || !currentUserId) return;
                const historyCollectionPath = `artifacts/${appId}/users/${currentUserId}/visits`;
                const q = query(collection(db, historyCollectionPath), orderBy("visitedAt", "desc"));

                historyUnsubscribe = onSnapshot(q, (querySnapshot) => {
                    if (historyList) historyList.innerHTML = '';
                    if (querySnapshot.empty) {
                        if (historyMsg) historyMsg.style.display = 'block';
                    } else {
                        if (historyMsg) historyMsg.style.display = 'none';
                        querySnapshot.forEach((doc) => {
                            const visit = doc.data();
                            const visitDate = visit.visitedAt?.toDate().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) || 'Unknown Date';
                            const li = document.createElement('li');
                            li.className = 'bg-white shadow-lg rounded-xl p-5 mb-4 animate-fade-in border border-gray-100';
                            li.innerHTML = `
                                <div class="flex justify-between items-start">
                                    <div>
                                        <h3 class="text-lg font-semibold text-blue-600">Visit on ${visitDate}</h3>
                                        <p class="text-gray-600 mt-1"><span class="font-medium">Reason:</span> ${visit.issue || 'N/A'}</p>
                                    </div>
                                    ${visit.fee ? `<p class="text-lg font-bold text-emerald-600">₹${parseFloat(visit.fee).toFixed(2)}</p>` : ''}
                                </div>
                                <div class="mt-4 pt-4 border-t border-gray-100">
                                    <p class="text-gray-800 font-medium">Doctor's Notes:</p>
                                    <p class="text-gray-700 bg-gray-50 p-3 rounded-md mt-2 whitespace-pre-wrap">${visit.notes || 'No notes provided.'}</p>
                                </div>
                            `;
                            if (historyList) historyList.appendChild(li);
                        });
                    }
                }, (error) => {
                    console.error("Error getting visit history:", error);
                    if (historyMsg) historyMsg.textContent = 'Could not load your visit history.';
                    if (historyMsg) historyMsg.style.display = 'block';
                });
            }

            // --- 6. Patient: Appointments Logic ---

            function populateTimeSlots() {
                if (!aptTimeSelect) return;
                aptTimeSelect.innerHTML = '<option value="">Select a time</option>';
                for (let hour = 9; hour < 17; hour++) {
                    aptTimeSelect.innerHTML += `<option value="${hour}:00">${hour}:00</option>`;
                    aptTimeSelect.innerHTML += `<option value="${hour}:30">${hour}:30</option>`;
                }
            }

            // --- FIXED: handleBookAppointment (Adds status: "pending") ---
            async function handleBookAppointment(e) {
                e.preventDefault();
                const dateStr = aptDateInput.value;
                const timeStr = aptTimeSelect.value;
                const reason = aptReasonInput.value.trim();

                if (!dateStr || !timeStr || !reason) {
                    showModal("Please select a date, time, and provide a reason.");
                    return;
                }

                const [year, month, day] = dateStr.split('-');
                const [hour, minute] = timeStr.split(':');
                const aptDateTime = new Date(year, month - 1, day, hour, minute);

                if (aptDateTime < new Date()) {
                    showModal("You cannot book an appointment in the past.");
                    return;
                }

                if (aptBookBtn) {
                    aptBookBtn.disabled = true;
                    aptBookBtn.textContent = 'Sending Request...';
                }

                try {
                    await Tone.start();
                    await addDoc(collection(db, "appointments"), {
                        patientId: currentUserId,
                        patientName: currentUserDisplayName,
                        reason: reason,
                        appointmentAt: Timestamp.fromDate(aptDateTime),
                        status: "pending" // <-- REQUIRED FIX FOR DOCTOR PAGE
                    });
                    showModal("Appointment request sent successfully! The doctor will confirm it shortly.");
                    aptReasonInput.value = '';
                    aptTimeSelect.value = '';
                    aptDateInput.value = '';
                } catch (error) {
                    console.error("Error booking appointment:", error);
                    showModal("Could not book appointment. Please try again.");
                } finally {
                    if (aptBookBtn) {
                        aptBookBtn.disabled = false;
                        aptBookBtn.textContent = 'Send Request';
                    }
                }
            }
            
            // --- FIXED: attachMyAppointmentListener (Shows status) ---
            function attachMyAppointmentListener() {
                if (!isAuthReady || !db || !currentUserId) return;
                const q = query(collection(db, "appointments"),
                                where("patientId", "==", currentUserId),
                                orderBy("appointmentAt", "asc"));

                myAppointmentsUnsubscribe = onSnapshot(q, (querySnapshot) => {
                    if (myAptList) myAptList.innerHTML = '';
                    if (querySnapshot.empty) {
                        if (myAptMsg) myAptMsg.style.display = 'block';
                    } else {
                        if (myAptMsg) myAptMsg.style.display = 'none';
                        querySnapshot.forEach((doc) => {
                            const apt = doc.data();
                            const aptDate = apt.appointmentAt?.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) || 'Unknown Date';
                            const li = document.createElement('li');
                            
                            let statusHTML = '';
                            if (apt.status === 'confirmed') {
                                li.className = 'bg-white shadow-lg rounded-xl p-5 mb-4 animate-fade-in border-l-4 border-emerald-500';
                                statusHTML = `<div class="mt-3 text-sm font-medium text-emerald-600">Status: Confirmed</div>`;
                            } else if (apt.status === 'declined') {
                                li.className = 'bg-white shadow-lg rounded-xl p-5 mb-4 animate-fade-in border-l-4 border-red-500 opacity-70';
                                statusHTML = `<div class="mt-3 text-sm">
                                    <p class="font-medium text-red-600">Status: Declined</p>
                                    <p class="text-gray-600 mt-1"><span class="font-medium">Reason:</span> ${apt.declineReason || 'No reason provided.'}</p>
                                </div>`;
                            } else {
                                li.className = 'bg-white shadow-lg rounded-xl p-5 mb-4 animate-fade-in border-l-4 border-yellow-500';
                                statusHTML = `<div class="mt-3 text-sm font-medium text-yellow-600">Status: Pending Confirmation</div>`;
                            }
                            
                            li.innerHTML = `
                                <h3 class="text-lg font-semibold text-blue-600">${aptDate}</h3>
                                <p class="text-gray-600 mt-1"><span class="font-medium">Reason:</span> ${apt.reason || 'N/A'}</p>
                                ${statusHTML}
                            `;
                            if (myAptList) myAptList.appendChild(li);
                        });
                    }
                }, (error) => {
                    console.error("Error getting my appointments:", error);
                    if (myAptMsg) myAptMsg.textContent = 'Could not load your appointments.';
                    if (myAptMsg) myAptMsg.style.display = 'block';
                });
            }

            // --- 7. Patient: Profile Logic ---

            function attachProfileListener() {
                if (!isAuthReady || !db || !currentUserId) return;
                const profileRef = doc(db, `artifacts/${appId}/users/${currentUserId}/profile/details`);
                profileUnsubscribe = onSnapshot(profileRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        if (profileNameInput) profileNameInput.value = data.name || '';
                        if (profileMobileInput) profileMobileInput.value = data.mobile || '';
                    } else {
                        if (profileNameInput) profileNameInput.value = currentUserDisplayName || '';
                    }
                }, (error) => {
                    console.error("Error getting profile:", error);
                    if (profileMsg) {
                        profileMsg.textContent = "Error loading profile.";
                        profileMsg.className = "text-sm text-red-600";
                        profileMsg.style.display = 'block';
                    }
                });
            }

            async function handleProfileUpdate(e) {
                e.preventDefault();
                if (!profileNameInput || !profileMobileInput) return;
                const newName = profileNameInput.value.trim();
                const newMobile = profileMobileInput.value.trim();

                if (!newName || !newMobile) {
                    showModal("Please fill in both name and mobile number.");
                    return;
                }

                if (profileUpdateBtn) {
                    profileUpdateBtn.disabled = true;
                    profileUpdateBtn.textContent = 'Updating...';
                }

                try {
                    await updateProfile(auth.currentUser, { displayName: newName });
                    const profileRef = doc(db, `artifacts/${appId}/users/${currentUserId}/profile/details`);
                    await setDoc(profileRef, {
                        name: newName,
                        mobile: newMobile
                    }, { merge: true });

                    if (profileMsg) {
                        profileMsg.textContent = "Profile updated successfully!";
                        profileMsg.className = "text-sm text-emerald-600";
                        profileMsg.style.display = 'block';
                    }
                    setTimeout(() => { if (profileMsg) profileMsg.style.display = 'none'; }, 3000);

                } catch (error) {
                    console.error("Error updating profile:", error);
                    if (profileMsg) {
                        profileMsg.textContent = `Error: ${error.message}`;
                        profileMsg.className = "text-sm text-red-600";
                        profileMsg.style.display = 'block';
                    }
                } finally {
                    if (profileUpdateBtn) {
                        profileUpdateBtn.disabled = false;
                        profileUpdateBtn.textContent = 'Update Profile';
                    }
                }
            }
            
            // --- Global Utilities ---
            function showModal(message) {
                if (modalMessage) modalMessage.textContent = message;
                if (modal) modal.style.display = 'flex';
            }

            function closeModal() {
                if (modal) modal.style.display = 'none';
            }

            // --- Get All DOM Elements ---
            patientApp = document.getElementById('patient-app');

            patientPages['book'] = document.getElementById('patient-page-book');
            patientPages['history'] = document.getElementById('patient-page-history');
            patientPages['appointments'] = document.getElementById('patient-page-appointments');
            patientPages['profile'] = document.getElementById('patient-page-profile');

            // Top Navbar
            mainNav = document.getElementById('main-nav');
            authControls = document.getElementById('auth-controls');
            userDisplay = document.getElementById('user-display');
            logoutBtn = document.getElementById('logout-btn');

            // Bottom Navbar
            bottomNav = document.getElementById('bottom-nav');
            bottomNavBook = document.getElementById('bottom-nav-book');
            bottomNavAppointments = document.getElementById('bottom-nav-appointments');
            bottomNavHistory = document.getElementById('bottom-nav-history');
            bottomNavProfile = document.getElementById('bottom-nav-profile');
            bottomNavItems = [bottomNavBook, bottomNavAppointments, bottomNavHistory, bottomNavProfile];

            // Patient: Book
            distanceEl = document.getElementById('distance');
            geoStatusEl = document.getElementById('geo-status');
            bookingForm = document.getElementById('booking-form');
            joinQueueBtn = document.getElementById('join-queue-btn');
            patientNameInput = document.getElementById('patient-name');
            patientMobileInput = document.getElementById('patient-mobile');
            patientIssueInput = document.getElementById('patient-issue');
            queueStatusSection = document.getElementById('queue-status-section');
            queueMessageEl = document.getElementById('queue-message');
            queueNumberEl = document.getElementById('queue-number');
            queueEstimateEl = document.getElementById('queue-estimate');
            queueClosedMsg = document.getElementById('queue-closed-msg');

            // Patient: History
            historyList = document.getElementById('history-list');
            historyMsg = document.getElementById('history-msg');

            // Patient: Appointments
            aptDateInput = document.getElementById('apt-date');
            aptTimeSelect = document.getElementById('apt-time');
            aptReasonInput = document.getElementById('apt-reason');
            aptBookBtn = document.getElementById('apt-book-btn');
            myAptList = document.getElementById('my-apt-list');
            myAptMsg = document.getElementById('my-apt-msg');

            // Patient: Profile
            profileNameInput = document.getElementById('profile-name');
            profileMobileInput = document.getElementById('profile-mobile');
            profileUpdateBtn = document.getElementById('profile-update-btn');
            profileMsg = document.getElementById('profile-msg');
            mobileLogoutBtn = document.getElementById('mobile-logout-btn');
            
            // Global
            loadingOverlay = document.getElementById('loading-overlay');
            modal = document.getElementById('modal');
            modalMessage = document.getElementById('modal-message');
            modalCloseBtn = document.getElementById('modal-close-btn');

            // --- Add Event Listeners ---
            if (logoutBtn) logoutBtn.addEventListener('click', handleLogout); 
            if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', handleLogout);

            if (bookingForm) bookingForm.addEventListener('submit', joinQueue);

            if (aptDateInput) aptDateInput.min = new Date().toISOString().split('T')[0];
            if (aptDateInput) aptDateInput.valueAsDate = new Date();
            if (aptTimeSelect) populateTimeSlots();
            if (aptBookBtn) aptBookBtn.addEventListener('click', handleBookAppointment);

            if (profileUpdateBtn) profileUpdateBtn.addEventListener('click', handleProfileUpdate);

            if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

            // Page Navigation Listeners (Bottom Nav)
            if (bottomNavBook) bottomNavBook.addEventListener('click', () => showPatientView('book'));
            if (bottomNavAppointments) bottomNavAppointments.addEventListener('click', () => showPatientView('appointments'));
            if (bottomNavHistory) bottomNavHistory.addEventListener('click', () => showPatientView('history'));
            if (bottomNavProfile) bottomNavProfile.addEventListener('click', () => showPatientView('profile'));

            // --- Auth State Change Listener (Auth Guard) ---
            onAuthStateChanged(auth, async (user) => {
                isAuthReady = true;
                if (user) {
                    if (user.email === ADMIN_EMAIL) {
                        window.location.href = 'doctor.html';
                        return;
                    }
                    
                    // --- Valid Patient ---
                    currentUserId = user.uid;
                    currentUserEmail = user.email;
                    currentUserDisplayName = user.displayName;

                    if (userDisplay) userDisplay.textContent = user.displayName || user.email;
                    if (authControls) authControls.style.display = 'flex';
                    if (mainNav) mainNav.style.display = 'flex';
                    if (bottomNav) bottomNav.style.display = 'flex'; 
                    
                    await loadClinicSettings(); 

                    if (patientNameInput) patientNameInput.value = user.displayName || '';
                    const profileRef = doc(db, `artifacts/${appId}/users/${currentUserId}/profile/details`);
                    getDoc(profileRef).then(docSnap => {
                        if (docSnap.exists()) {
                            if (patientMobileInput) patientMobileInput.value = docSnap.data().mobile || '';
                        }
                    });

                    showPatientView('book');

                } else {
                    // --- Not Logged In ---
                    isAuthReady = false;
                    window.location.href = 'index.html'; // Redirect to login
                }
            });

        }; // <-- End of window.onload
    </script>
</head>
<body class="bg-gray-100 font-sans">

    <nav class="bg-white shadow-md sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div id="main-nav" class="flex items-center justify-between h-16" style="display: none;">
                
                <div class="flex-shrink-0 flex items-center gap-2">
                    <img class="h-8 w-auto" src="/logo.jpg" alt="MediQueue Logo">
                    <span class="font-bold text-xl text-blue-600">MediQueue</span>
                </div>

                <div id="auth-controls" class="hidden md:flex items-center" style="display: none;">
                    <span id="user-display" class="text-gray-700 text-sm font-medium mr-4">user@example.com</span>
                    <button id="logout-btn" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium">Logout</button>
                </div>

            </div>
        </div>
    </nav>

    <main class="pb-20">
        <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">

            <div id="patient-app" style="display: none;">

                <div id="patient-page-book" style="display: none;" class="px-4">
                    
                    <div id="queue-status-section" class="mt-2 text-center p-6 sm:p-8 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl shadow-xl" style="display: none;">
                        <h2 id="queue-message" class="text-xl sm:text-2xl font-bold mb-3">Your position in queue:</h2>
                        <p id="queue-number" class="text-7xl font-extrabold my-4">#0</p>
                        <p id="queue-estimate" class="text-lg font-medium opacity-80">~ 0 min wait</p>
                    </div>
                    
                    <div id="queue-closed-msg" class="text-center p-5 bg-gradient-to-r from-orange-100 to-red-100 text-orange-800 rounded-xl border border-orange-200" style="display: none;">
                        <svg class="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                        </svg>
                        <p class="font-semibold">The live queue is currently closed.</p>
                    </div>
                    
                    <form id="booking-form" style="display: none;" class="mt-4 bg-white/80 backdrop-blur-sm p-5 sm:p-8 rounded-2xl shadow-xl border border-gray-100 max-w-2xl mx-auto">
                        <div class="mb-6">
                            <h2 class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2 flex items-center gap-2">
                                <svg class="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                </svg>
                                1. Location Check
                            </h2>
                        </div>
                        <div id="geo-status-container" class="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl">
                            <p class="text-sm text-gray-700 mb-2 flex items-center gap-2">
                                <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path>
                                </svg>
                                Distance from clinic: <span id="distance" class="font-bold text-blue-700">- meters</span>
                            </p>
                            <p id="geo-status" class="text-base sm:text-lg font-semibold text-blue-600">Checking your location...</p>
                        </div>

                        <h2 class="text-xl sm:text-2xl font-bold text-gray-900 mb-5 flex items-center gap-2">
                            <span class="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">2</span>
                            Join Today's Queue
                        </h2>
                        <div class="space-y-4 sm:space-y-5">
                            <div>
                                <label for="patient-name" class="block text-sm font-semibold text-gray-700 mb-2">Your Name</label>
                                <input type="text" id="patient-name" class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition-all duration-200 bg-gray-50" readonly>
                            </div>
                            <div>
                                <label for="patient-mobile" class="block text-sm font-semibold text-gray-700 mb-2">Mobile No.</label>
                                <input type="tel" id="patient-mobile" class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition-all duration-200" placeholder="Your 10-digit mobile number" required>
                            </div>
                            <div>
                                <label for="patient-issue" class="block text-sm font-semibold text-gray-700 mb-2">Reason for Visit</label>
                                <textarea id="patient-issue" rows="3" class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition-all duration-200 resize-none" placeholder="e.g., Fever, checkup..." required></textarea>
                            </div>
                            <button id="join-queue-btn" type="submit" disabled class="w-full flex justify-center items-center gap-2 py-3.5 px-6 border border-transparent rounded-xl shadow-lg text-sm sm:text-base font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-xl disabled:transform-none">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                </svg>
                                Join Queue
                            </button>
                        </div>
                    </form>
                </div>
                
                <div id="patient-page-appointments" style="display: none;" class="px-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="bg-white/80 backdrop-blur-sm p-5 sm:p-6 rounded-2xl shadow-xl border border-gray-100">
                            <h2 class="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                Book a Future Slot
                            </h2>
                            <form id="apt-form" class="space-y-4">
                                <div>
                                    <label for="apt-date" class="block text-sm font-medium text-gray-700">Select Date</label>
                                    <input type="date" id="apt-date" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required>
                                </div>
                                <div>
                                    <label for="apt-time" class="block text-sm font-medium text-gray-700">Select Time</label>
                                    <select id="apt-time" class="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required>
                                        <option value="">Select a time</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="apt-reason" class="block text-sm font-medium text-gray-700">Reason for Appointment</label>
                                    <textarea id="apt-reason" rows="3" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="e.g., Annual checkup..." required></textarea>
                                </div>
                                <button id="apt-book-btn" type="button" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all transform hover:-translate-y-0.5">
                                    Send Request
                                </button>
                            </form>
                        </div>
                        
                        <div class="bg-white/80 backdrop-blur-sm p-5 sm:p-6 rounded-2xl shadow-xl border border-gray-100">
                            <h2 class="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                My Bookings
                            </h2>
                            <div id="my-apt-msg" class="text-center p-4 bg-gray-100 text-gray-700 rounded-lg" style="display: none;">
                                You have no upcoming appointments.
                            </div>
                            <ul id="my-apt-list" class="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                                </ul>
                        </div>
                    </div>
                </div>

                <div id="patient-page-history" style="display: none;" class="px-4">
                    <div class="bg-white/80 backdrop-blur-sm p-5 sm:p-6 rounded-2xl shadow-xl border border-gray-100 max-w-3xl mx-auto">
                        <h2 class="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H7a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                            My Visit History
                        </h2>
                        <div id="history-msg" class="text-center p-4 bg-gray-100 text-gray-700 rounded-lg" style="display: none;">
                            You have no visit history. Notes from your completed visits will appear here.
                        </div>
                        <ul id="history-list" class="space-y-4">
                            </ul>
                    </div>
                </div>
                
                <div id="patient-page-profile" style="display: none;" class="px-4">
                    <div class="bg-white/80 backdrop-blur-sm p-5 sm:p-6 rounded-2xl shadow-xl border border-gray-100 max-w-lg mx-auto">
                        <h2 class="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            My Profile
                        </h2>
                        <form id="profile-form" class="space-y-4">
                            <div>
                                <label for="profile-name" class="block text-sm font-medium text-gray-700">Your Name</label>
                                <input type="text" id="profile-name" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required>
                            </div>
                            <div>
                                <label for="profile-mobile" class="block text-sm font-medium text-gray-700">Mobile No.</label>
                                <input type="tel" id="profile-mobile" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Your 10-digit mobile number" required>
                            </div>
                            <button id="profile-update-btn" type="button" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all transform hover:-translate-y-0.5">
                                Update Profile
                            </button>
                            <div id="profile-msg" class="text-sm text-center" style="display: none;"></div>
                        </form>
                        <hr class="my-6">
                        <button id="mobile-logout-btn" class="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all transform hover:-translate-y-0.5 md:hidden">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                            Logout
                        </button>
                    </div>
                </div>

            </div>
        </div>
    </main>

    <nav id="bottom-nav" class="fixed bottom-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-md border-t border-gray-200 flex md:hidden z-40" style="display: none;">
        <button id="bottom-nav-book" class="flex-1 flex flex-col items-center justify-center p-2 text-sm font-medium text-gray-500 hover:text-blue-600 transition-all duration-150">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6-4h.01M12 12h.01M15 12h.01M12 15h.01M15 15h.01M9 15h.01"></path></svg>
            <span class="text-xs">Home</span>
        </button>
        <button id="bottom-nav-appointments" class="flex-1 flex flex-col items-center justify-center p-2 text-sm font-medium text-gray-500 hover:text-blue-600 transition-all duration-150">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <span class="text-xs">Bookings</span>
        </button>
        <button id="bottom-nav-history" class="flex-1 flex flex-col items-center justify-center p-2 text-sm font-medium text-gray-500 hover:text-blue-600 transition-all duration-150">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H7a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
            <span class="text-xs">History</span>
        </button>
        <button id="bottom-nav-profile" class="flex-1 flex flex-col items-center justify-center p-2 text-sm font-medium text-gray-500 hover:text-blue-600 transition-all duration-150">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            <span class="text-xs">Profile</span>
        </button>
    </nav>

    <div id="loading-overlay" class="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50" style="display: none;">
        <div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white"></div>
    </div>

    <div id="modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4" style="display: none;">
        <div class="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 animate-fade-in">
            <h3 class="text-lg font-medium text-gray-900">Notification</h3>
            <p id="modal-message" class="mt-2 text-sm text-gray-600">This is an alert message.</p>
            <div class="mt-4 text-right">
                <button id="modal-close-btn" type="button" class="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    OK
                </button>
            </div>
        </div>
    </div>

</body>
</html>