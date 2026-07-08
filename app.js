// MedVibe Core Engine - Cross-page State Synchronization & Security

// Doctor Database Defs
const doctorsDefault = {
    1: {
        id: 1,
        name: "Dr. Vishal Parmar",
        specialty: "Skin Specialist",
        fee: 800,
        pin: "1111",
        avatar: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=80&auto=format&fit=crop&q=80"
    },
    2: {
        id: 2,
        name: "Dr. Ananya Sharma",
        specialty: "Pediatrician",
        fee: 600,
        pin: "2222",
        avatar: "https://images.unsplash.com/photo-1594824813573-246434de83fb?w=80&auto=format&fit=crop&q=80"
    }
};

let doctors = {...doctorsDefault};
let paymentSettings = {
    cardEnabled: true,
    upiEnabled: true,
    upiId: "medvibe@upi"
};

// State Variables
let slots = [];
let chats = [];
let selectedDoctorId = 1;
let selectedSlotId = null;
let activeChatDocId = null;
let currentPaymentMethod = 'card';
let currentDocChatPatient = null; // Doctor consultation active chat patient
const defaultPatients = ["Aarav Sharma", "Riya Verma"];
let currentCarouselStartIndex = 0; // Carousel index tracker

// Generate Default Scheduling Slots (1 Month of slots starting from Today's System Date)
function generateDefaultSlots() {
    const defaultSlots = [];
    const times = ["09:00 AM", "10:30 AM", "12:00 PM", "02:30 PM", "04:00 PM", "05:30 PM"];
    
    const today = new Date();
    today.setHours(0,0,0,0); 

    const getIsoString = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    let idCounter = 1;
    [1, 2].forEach(docId => {
        for (let d = 0; d < 30; d++) { // 30 days of slots starting from today
            const dateObj = new Date(today.getTime() + d * 24 * 60 * 60 * 1000);
            const dateIso = getIsoString(dateObj);
            
            // Format: "Thursday, Jul 9"
            const dateLabel = dateObj.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
            });
            
            times.forEach(time => {
                defaultSlots.push({
                    id: `slot-${docId}-${idCounter++}`,
                    doctorId: docId,
                    date: dateLabel,
                    dateIso: dateIso,
                    time: time,
                    status: 'available', // available, pending, booked
                    patientName: '',
                    patientPhone: '',
                    patientProblem: '',
                    paymentStatus: 'unpaid', // unpaid, paid
                    paymentMethod: '' // Card, UPI
                });
            });
        }
    });
    return defaultSlots;
}

// Roll calendar forward dynamically by purging past dates and appending future dates
function syncRollingSlots() {
    const today = new Date();
    today.setHours(0,0,0,0);

    const getIsoString = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const todayIso = getIsoString(today);

    // 1. Clear out slots that are in the past
    slots = slots.filter(s => s.dateIso >= todayIso);

    // Get max slot counter to avoid duplicate IDs
    let maxId = 0;
    slots.forEach(s => {
        const num = parseInt(s.id.split('-')[2]);
        if (num > maxId) maxId = num;
    });
    let idCounter = maxId + 1;

    const times = ["09:00 AM", "10:30 AM", "12:00 PM", "02:30 PM", "04:00 PM", "05:30 PM"];

    // 2. Ensure we have exactly 30 days of slots starting from today
    [1, 2].forEach(docId => {
        for (let d = 0; d < 30; d++) {
            const dateObj = new Date(today.getTime() + d * 24 * 60 * 60 * 1000);
            const dateIso = getIsoString(dateObj);

            // If slots for this date and doctor do not exist, generate them
            const exists = slots.some(s => s.doctorId === docId && s.dateIso === dateIso);
            if (!exists) {
                const dateLabel = dateObj.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                });

                times.forEach(time => {
                    slots.push({
                        id: `slot-${docId}-${idCounter++}`,
                        doctorId: docId,
                        date: dateLabel,
                        dateIso: dateIso,
                        time: time,
                        status: 'available',
                        patientName: '',
                        patientPhone: '',
                        patientProblem: '',
                        paymentStatus: 'unpaid',
                        paymentMethod: ''
                    });
                });
            }
        }
    });

    // Sort slots by dateIso and keep original stable order for times
    slots.sort((a, b) => {
        if (a.dateIso !== b.dateIso) {
            return a.dateIso.localeCompare(b.dateIso);
        }
        return 0; // keep stable order
    });

    saveData();
}

// Data Load & Save
function saveData() {
    try {
        localStorage.setItem('medvibe_slots', JSON.stringify(slots));
        localStorage.setItem('medvibe_chats', JSON.stringify(chats));
    } catch (e) {
        console.warn("localStorage write blocked. Operating in-memory.", e);
    }
}

function loadData() {
    let savedSlots = null;
    let savedChats = null;
    let savedDocs = null;
    let savedPay = null;

    try {
        savedSlots = localStorage.getItem('medvibe_slots');
        savedChats = localStorage.getItem('medvibe_chats');
        savedDocs = localStorage.getItem('medvibe_doctors');
        savedPay = localStorage.getItem('medvibe_pay_settings');
    } catch (e) {
        console.warn("localStorage read blocked. Operating in-memory.", e);
    }

    if (savedDocs) {
        doctors = JSON.parse(savedDocs);
    } else {
        localStorage.setItem('medvibe_doctors', JSON.stringify(doctorsDefault));
    }

    if (savedPay) {
        paymentSettings = JSON.parse(savedPay);
    } else {
        localStorage.setItem('medvibe_pay_settings', JSON.stringify(paymentSettings));
    }

    if (savedSlots) {
        slots = JSON.parse(savedSlots);
        // Force slot migration if slots schema lacks dateIso or is old
        const needsMigrate = slots.length < 100 || !slots.some(s => 'dateIso' in s);
        if (needsMigrate) {
            slots = generateDefaultSlots();
            saveData();
        } else {
            syncRollingSlots();
        }
    } else {
        slots = generateDefaultSlots();
        saveData();
    }

    if (savedChats) {
        chats = JSON.parse(savedChats);
    } else {
        chats = [
            {
                id: "welcome-1",
                sender: "doctor1",
                recipient: "Aarav Sharma",
                text: "Hello! I am Dr. Vishal Parmar. How can I help you with your skin concern today?",
                timestamp: Date.now() - 3600000,
                doctorId: 1
            },
            {
                id: "welcome-2",
                sender: "doctor2",
                recipient: "Riya Verma",
                text: "Hello! I am Dr. Ananya Sharma. Feel free to ask any questions about your child's health.",
                timestamp: Date.now() - 3600000,
                doctorId: 2
            }
        ];
        saveData();
    }
}

// Select Doctor calendar tab
function selectDocForBooking(docId) {
    selectedDoctorId = docId;
    currentCarouselStartIndex = 0; // reset slide window
    
    const card1 = document.getElementById('select-doc-card-1');
    const card2 = document.getElementById('select-doc-card-2');
    if (card1 && card2) {
        card1.classList.remove('active');
        card2.classList.remove('active');
        document.getElementById(`select-doc-card-${docId}`).classList.add('active');
    }
    
    // Update Doctor Title on calendar
    const docName = doctors[docId].name;
    const title = document.getElementById('calendar-doctor-title');
    if (title) {
        title.innerText = `${docName}'s Free Slots`;
    }
    
    renderSlotsGrid();
}

// Render slots grid on calendar board (Side-by-side Calendar Columns with Carousel Navigation)
function renderSlotsGrid() {
    const container = document.getElementById('slots-grid-container');
    if (!container) return; // not on patient page

    container.innerHTML = '';
    container.className = 'calendar-grid'; // apply columns styling

    const docSlots = slots.filter(s => s.doctorId === selectedDoctorId);
    
    // Group slots by date
    const groupedSlots = {};
    docSlots.forEach(slot => {
        if (!groupedSlots[slot.date]) {
            groupedSlots[slot.date] = [];
        }
        groupedSlots[slot.date].push(slot);
    });

    const uniqueDates = Object.keys(groupedSlots); // List of unique dates (e.g. 30 dates)

    // Slice for carousel visibility (3 days at a time)
    const visibleDates = uniqueDates.slice(currentCarouselStartIndex, currentCarouselStartIndex + 3);

    // Update carousel navigation label & button states
    const rangeLabel = document.getElementById('carousel-date-range-label');
    if (rangeLabel && visibleDates.length > 0) {
        rangeLabel.innerText = `${visibleDates[0]} - ${visibleDates[visibleDates.length - 1]}`;
    }

    const prevBtn = document.getElementById('prev-days-btn');
    const nextBtn = document.getElementById('next-days-btn');
    if (prevBtn && nextBtn) {
        prevBtn.disabled = currentCarouselStartIndex === 0;
        nextBtn.disabled = currentCarouselStartIndex >= uniqueDates.length - 3;
        
        // Mute style if disabled
        prevBtn.style.opacity = prevBtn.disabled ? "0.4" : "1";
        nextBtn.style.opacity = nextBtn.disabled ? "0.4" : "1";
        prevBtn.style.cursor = prevBtn.disabled ? "not-allowed" : "pointer";
        nextBtn.style.cursor = nextBtn.disabled ? "not-allowed" : "pointer";
    }

    // Render columns for only the visible dates
    visibleDates.forEach(date => {
        const col = document.createElement('div');
        col.className = 'calendar-col';

        const header = document.createElement('div');
        header.className = 'calendar-date-header';
        header.innerHTML = `<i class="fa-regular fa-calendar-days"></i> ${date}`;
        col.appendChild(header);

        const list = document.createElement('div');
        list.className = 'calendar-slots-list';

        groupedSlots[date].forEach(slot => {
            const slotBtn = document.createElement('button');
            slotBtn.className = `slot-btn ${slot.status}`;
            slotBtn.onclick = () => {
                if (slot.status === 'available') {
                    openPaymentModal(slot.id);
                }
            };

            const timeSpan = document.createElement('span');
            timeSpan.className = 'slot-time';
            timeSpan.innerText = slot.time;

            const statusSpan = document.createElement('span');
            statusSpan.className = 'slot-status-txt';
            statusSpan.innerText = slot.status;

            slotBtn.appendChild(timeSpan);
            slotBtn.appendChild(statusSpan);
            list.appendChild(slotBtn);
        });

        col.appendChild(list);
        container.appendChild(col);
    });
}

// Slide calendar left (-1) or right (+1)
function slideCalendar(direction) {
    const docSlots = slots.filter(s => s.doctorId === selectedDoctorId);
    const uniqueDates = [...new Set(docSlots.map(s => s.date))];
    
    // Shift by 3 days
    const newIndex = currentCarouselStartIndex + (direction * 3);
    
    if (newIndex >= 0 && newIndex <= uniqueDates.length - 3) {
        currentCarouselStartIndex = newIndex;
        renderSlotsGrid();
    }
}

// Scroll to scheduling
function scrollToScheduling(docId) {
    selectDocForBooking(docId);
    document.getElementById('scheduling-section').scrollIntoView({ behavior: 'smooth' });
}

// Patient Chat trigger from doctor biodata cards
function openChatWithDoc(docId) {
    const panel = document.getElementById('patient-chat-panel');
    if (panel && !panel.classList.contains('open')) {
        panel.classList.add('open');
    }
    startPatientChat(docId);
}

// Open chat window helper
function togglePatientChatWidget() {
    const panel = document.getElementById('patient-chat-panel');
    if (panel) {
        panel.classList.toggle('open');
    }
}

// Select chat thread
function startPatientChat(docId) {
    activeChatDocId = docId;
    const doc = doctors[docId];

    document.getElementById('chat-widget-title').innerText = doc.name;
    document.getElementById('chat-widget-subtitle').innerHTML = `<i class="fa-solid fa-circle" style="font-size:0.6rem; color:var(--status-available);"></i> Active Consultant`;

    document.getElementById('patient-chat-welcome').style.display = 'none';
    document.getElementById('patient-chat-messages').style.display = 'flex';
    document.getElementById('patient-chat-input-bar').style.display = 'flex';

    loadPatientChatMessages();
}

function loadPatientChatMessages() {
    const msgArea = document.getElementById('patient-chat-messages');
    if (!msgArea) return;
    msgArea.innerHTML = '';

    const activePatient = getLastPatientName();

    const thread = chats.filter(m => 
        m.doctorId === activeChatDocId && 
        (m.recipient === activePatient || m.sender === activePatient || m.recipient === 'patient' || m.sender === 'patient')
    );

    thread.forEach(msg => {
        const bubble = document.createElement('div');
        const isPatientSender = msg.sender === 'patient' || msg.sender === activePatient;
        bubble.className = `chat-message ${isPatientSender ? 'sent' : 'received'}`;
        bubble.innerText = msg.text;
        msgArea.appendChild(bubble);
    });

    msgArea.scrollTop = msgArea.scrollHeight;
}

function getLastPatientName() {
    const nameInput = document.getElementById('patient-reg-name');
    const name = nameInput ? nameInput.value.trim() : "";
    return name !== "" ? name : "Aarav Sharma";
}

function handlePatientChatKeyDown(event) {
    if (event.key === 'Enter') {
        sendPatientMessage();
    }
}

function sendPatientMessage() {
    const input = document.getElementById('patient-message-input');
    const text = input.value.trim();
    if (text === '') return;

    const patientName = getLastPatientName();

    const newMsg = {
        id: `msg-${Date.now()}`,
        sender: 'patient',
        recipient: `doctor${activeChatDocId}`,
        text: text,
        timestamp: Date.now(),
        doctorId: activeChatDocId
    };

    chats.push(newMsg);
    saveData();

    input.value = '';
    loadPatientChatMessages();
}

// Payment Modals logic
function openPaymentModal(slotId) {
    selectedSlotId = slotId;
    const slot = slots.find(s => s.id === slotId);
    const doctor = doctors[slot.doctorId];

    // Reset Intake form fields
    const regName = document.getElementById('patient-reg-name');
    if (regName) regName.value = '';
    const regPhone = document.getElementById('patient-reg-phone');
    if (regPhone) regPhone.value = '';
    const regProblem = document.getElementById('patient-reg-problem');
    if (regProblem) regProblem.value = '';

    // Bind values
    const intakeDocName = document.getElementById('intake-doc-name');
    if (intakeDocName) intakeDocName.innerText = doctor.name;
    
    const intakeDocSpec = document.getElementById('intake-doc-specialty');
    if (intakeDocSpec) intakeDocSpec.innerText = doctor.specialty;
    
    const intakeFeeAmount = document.getElementById('intake-fee-amount');
    if (intakeFeeAmount) intakeFeeAmount.innerText = `₹${doctor.fee}`;
    
    const payDocName = document.getElementById('pay-doc-name');
    if (payDocName) payDocName.innerText = `${doctor.name}`;
    
    const payDocSpec = document.getElementById('pay-doc-specialty');
    if (payDocSpec) payDocSpec.innerText = doctor.specialty;
    
    const payFeeAmt = document.getElementById('pay-fee-amount');
    if (payFeeAmt) payFeeAmt.innerText = `₹${doctor.fee}`;
    
    const successFee = document.getElementById('success-fee');
    if (successFee) successFee.innerText = `₹${doctor.fee}`;

    // Reset view steps
    const modalStepTitle = document.getElementById('modal-step-title');
    if (modalStepTitle) modalStepTitle.innerHTML = `<i class="fa-solid fa-file-invoice-dollar" style="color:#0284c7;"></i> Booking Details`;
    
    const paymentIntakeBody = document.getElementById('payment-intake-body');
    if (paymentIntakeBody) paymentIntakeBody.style.display = 'block';
    
    const paymentFormBody = document.getElementById('payment-form-body');
    if (paymentFormBody) paymentFormBody.style.display = 'none';
    
    const paymentLoaderScreen = document.getElementById('payment-loader-screen');
    if (paymentLoaderScreen) paymentLoaderScreen.style.display = 'none';
    
    const paymentSuccessScreen = document.getElementById('payment-success-screen');
    if (paymentSuccessScreen) paymentSuccessScreen.style.display = 'none';

    const paymentModal = document.getElementById('payment-modal');
    if (paymentModal) paymentModal.classList.add('open');

    // Apply allowed payment tabs configurations
    applyPaymentSettings();
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.remove('open');
    selectedSlotId = null;
}

// Intake verification transition
function proceedToPaymentCheckout() {
    const name = document.getElementById('patient-reg-name').value.trim();
    const phone = document.getElementById('patient-reg-phone').value.trim();
    const problem = document.getElementById('patient-reg-problem').value.trim();

    if (!name || !phone || !problem) {
        alert("Please enter patient name, mobile number, and problem details before continuing.");
        return;
    }

    // Toggle panels
    document.getElementById('modal-step-title').innerHTML = `<i class="fa-solid fa-shield-halved" style="color:#0284c7;"></i> Secure Payment Checkout`;
    document.getElementById('payment-intake-body').style.display = 'none';
    document.getElementById('payment-form-body').style.display = 'block';
}

function setPaymentMethod(method) {
    currentPaymentMethod = method;
    document.getElementById('btn-pay-card').classList.remove('active');
    document.getElementById('btn-pay-upi').classList.remove('active');
    document.getElementById('pane-pay-card').classList.remove('active');
    document.getElementById('pane-pay-upi').classList.remove('active');

    if (method === 'card') {
        document.getElementById('btn-pay-card').classList.add('active');
        document.getElementById('pane-pay-card').classList.add('active');
    } else {
        document.getElementById('btn-pay-upi').classList.add('active');
        document.getElementById('pane-pay-upi').classList.add('active');
    }
}

function processPayment() {
    if (!selectedSlotId) return;

    const patientName = document.getElementById('patient-reg-name').value.trim();
    const patientPhone = document.getElementById('patient-reg-phone').value.trim();
    const patientProblem = document.getElementById('patient-reg-problem').value.trim();

    document.getElementById('payment-form-body').style.display = 'none';
    document.getElementById('payment-loader-screen').style.display = 'flex';

    setTimeout(() => {
        document.getElementById('payment-loader-screen').style.display = 'none';
        document.getElementById('payment-success-screen').style.display = 'flex';

        const slot = slots.find(s => s.id === selectedSlotId);
        const doctor = doctors[slot.doctorId];
        if (slot) {
            slot.status = 'booked'; // Auto-booked instantly on payment!
            slot.patientName = patientName;
            slot.patientPhone = patientPhone;
            slot.patientProblem = patientProblem;
            slot.paymentStatus = 'paid';
            slot.paymentMethod = currentPaymentMethod === 'card' ? 'Card' : 'UPI';
            saveData();
        }

        renderSlotsGrid();
        
        // Show floating mobile SMS notification
        showSMSNotification(patientPhone, doctor.name, slot.date, slot.time);
    }, 2000);
}

// Mobile SMS Notification simulator toast
function showSMSNotification(phone, docName, date, time) {
    const toast = document.createElement('div');
    toast.className = 'sms-toast-overlay';
    toast.innerHTML = `
        <div class="sms-toast-card">
            <div class="sms-toast-header">
                <span><i class="fa-solid fa-comment-sms" style="color:var(--accent-teal);"></i> Message Notification</span>
                <button class="sms-toast-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
            </div>
            <div class="sms-toast-body">
                <p><strong>To:</strong> +91 ${phone}</p>
                <div class="sms-bubble">
                    <strong>MedVibe Alert:</strong> Your consultation appointment with ${docName} is successfully confirmed for ${date} at ${time}. Thank you!
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    
    // Auto-dismiss after 7 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 7000);
}


// ================= DOCTOR SECURE WORKSPACE LOGIC =================

// Authenticate PIN
function attemptDoctorLogin() {
    const docId = parseInt(document.getElementById('login-doc-select').value);
    const pin = document.getElementById('login-doc-pin').value.trim();
    const errorMsg = document.getElementById('login-error-msg');

    if (doctors[docId] && doctors[docId].pin === pin) {
        errorMsg.style.display = 'none';
        document.getElementById('login-doc-pin').value = '';
        
        // Save session authentication state
        sessionStorage.setItem('medvibe_auth_doc', docId.toString());
        loadDoctorWorkspace(docId);
    } else {
        errorMsg.style.display = 'block';
        document.getElementById('login-doc-pin').value = '';
    }
}

function loadDoctorWorkspace(docId) {
    // Hide login and show dashboard workspace
    document.getElementById('doctor-login-pane').style.display = 'none';
    
    const workspace = document.getElementById('doctor-workspace-pane');
    workspace.style.display = 'block';

    const doc = doctors[docId];
    document.getElementById('active-doc-dashboard-title').innerText = `${doc.name}'s Dashboard`;
    document.getElementById('active-doc-specialty-tag').innerText = `${doc.specialty} Unit`;

    renderDoctorDashboard(docId);
}

function doctorLogout() {
    sessionStorage.removeItem('medvibe_auth_doc');
    window.location.reload();
}

function renderDoctorDashboard(docId) {
    const docSlots = slots.filter(s => s.doctorId === docId);
    const blockedCount = docSlots.filter(s => s.status === 'blocked').length;
    const confirmedCount = docSlots.filter(s => s.status === 'booked' && s.patientName).length;
    const fee = doctors[docId].fee;
    const totalEarnings = confirmedCount * fee;

    document.getElementById('active-doc-earnings').innerText = `₹${totalEarnings}`;
    document.getElementById('active-doc-pending-count').innerText = blockedCount; // re-purposed to Blocked Slots count
    document.getElementById('active-doc-confirmed-count').innerText = confirmedCount;

    // Render upcoming confirmed appointments
    const requestsList = document.getElementById('active-doc-requests-list');
    requestsList.innerHTML = '';

    const bookedRequests = docSlots.filter(s => s.status === 'booked' && s.patientName);

    if (bookedRequests.length === 0) {
        requestsList.innerHTML = `
            <div class="empty-requests">
                <i class="fa-solid fa-calendar-check" style="color:var(--text-muted); font-size: 2.5rem; margin-bottom: 0.5rem;"></i>
                <p>No confirmed appointments scheduled yet.</p>
            </div>
        `;
    } else {
        bookedRequests.forEach(req => {
            const reqItem = document.createElement('div');
            reqItem.className = 'request-item';
            reqItem.style.margin = '0'; // align within grid container
            reqItem.innerHTML = `
                <div class="req-patient-info" style="display: flex; flex-direction: column; gap: 0.35rem;">
                    <span class="req-patient-name" style="font-weight: 800; font-size: 1.15rem; color: var(--text-primary);">${req.patientName}</span>
                    <span class="req-datetime" style="font-size: 0.85rem; color: var(--text-secondary);">
                        <strong>Phone:</strong> ${req.patientPhone || 'N/A'}
                    </span>
                    <span class="req-datetime" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">
                        <strong>Problem:</strong> "${req.patientProblem || 'N/A'}"
                    </span>
                    <span class="req-datetime" style="font-size: 0.9rem; margin-top: 0.25rem;">
                        <i class="fa-regular fa-calendar" style="color: var(--accent-teal);"></i> ${req.date} at ${req.time}
                    </span>
                    <div style="margin-top: 0.25rem;">
                        <span class="req-payment-tag">
                            <i class="fa-solid fa-circle-check"></i> Paid (₹${fee} via ${req.paymentMethod || 'Card'})
                        </span>
                    </div>
                </div>
            `;
            requestsList.appendChild(reqItem);
        });
    }

    renderDoctorSlotManager(docId);
    renderDoctorInbox(docId);
}

// Doctor Schedule Manager panel
function renderDoctorSlotManager(docId) {
    const managerDiv = document.getElementById('active-doc-slot-manager');
    if (!managerDiv) return;
    managerDiv.innerHTML = '';

    const docSlots = slots.filter(s => s.doctorId === docId);
    
    // Group slots by date
    const grouped = {};
    docSlots.forEach(slot => {
        if (!grouped[slot.date]) {
            grouped[slot.date] = [];
        }
        grouped[slot.date].push(slot);
    });

    Object.keys(grouped).forEach(date => {
        const dateBlock = document.createElement('div');
        dateBlock.style.borderBottom = '1px solid rgba(15, 23, 42, 0.05)';
        dateBlock.style.paddingBottom = '0.75rem';

        const title = document.createElement('div');
        title.style.fontWeight = '800';
        title.style.fontSize = '0.9rem';
        title.style.color = 'var(--text-primary)';
        title.style.marginBottom = '0.4rem';
        title.innerHTML = `<i class="fa-regular fa-calendar" style="color:var(--accent-teal);"></i> ${date}`;
        dateBlock.appendChild(title);

        const list = document.createElement('div');
        list.style.display = 'grid';
        list.style.gridTemplateColumns = 'repeat(2, 1fr)';
        list.style.gap = '0.5rem';

        grouped[date].forEach(slot => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.background = 'white';
            item.style.border = '1px solid rgba(15, 23, 42, 0.06)';
            item.style.borderRadius = 'var(--radius-sm)';
            item.style.padding = '0.4rem 0.6rem';
            item.style.boxShadow = 'var(--shadow-sm)';

            const timeLabel = document.createElement('span');
            timeLabel.style.fontSize = '0.8rem';
            timeLabel.style.fontWeight = '700';
            timeLabel.innerText = slot.time;

            const actionBtn = document.createElement('button');
            actionBtn.style.padding = '0.2rem 0.4rem';
            actionBtn.style.fontSize = '0.7rem';
            actionBtn.style.fontWeight = '800';
            actionBtn.style.borderRadius = '4px';
            actionBtn.style.border = 'none';
            actionBtn.style.cursor = 'pointer';

            if (slot.status === 'available') {
                actionBtn.innerText = 'Block';
                actionBtn.style.background = 'rgba(217, 119, 6, 0.1)';
                actionBtn.style.color = 'var(--status-pending)';
                actionBtn.onclick = () => toggleSlotBlock(slot.id, docId, true);
            } else if (slot.status === 'blocked') {
                actionBtn.innerText = 'Unblock';
                actionBtn.style.background = 'rgba(5, 150, 105, 0.1)';
                actionBtn.style.color = 'var(--status-available)';
                actionBtn.onclick = () => toggleSlotBlock(slot.id, docId, false);
            } else {
                actionBtn.innerText = 'Booked';
                actionBtn.disabled = true;
                actionBtn.style.background = 'rgba(220, 38, 38, 0.1)';
                actionBtn.style.color = 'var(--status-booked)';
                actionBtn.style.cursor = 'not-allowed';
            }

            item.appendChild(timeLabel);
            item.appendChild(actionBtn);
            list.appendChild(item);
        });

        dateBlock.appendChild(list);
        dateBlock.style.marginBottom = '0.5rem';
        managerDiv.appendChild(dateBlock);
    });
}

function toggleSlotBlock(slotId, docId, block) {
    const slot = slots.find(s => s.id === slotId);
    if (slot) {
        slot.status = block ? 'blocked' : 'available';
        saveData();
        renderDoctorDashboard(docId);
        
        // Update client slots grid real-time
        renderSlotsGrid();
    }
}

function sendSystemChatMessage(docId, patientName, text) {
    const systemMsg = {
        id: `sys-${Date.now()}`,
        sender: `doctor${docId}`,
        recipient: patientName,
        text: text,
        timestamp: Date.now(),
        doctorId: docId
    };
    chats.push(systemMsg);
    saveData();
}

// Doctor Portal chat inbox sidebar
function renderDoctorInbox(docId) {
    const inbox = document.getElementById('active-doc-chat-inbox');
    if (!inbox) return;
    inbox.innerHTML = '';

    const dynamicPatients = new Set(defaultPatients);

    // Pull patient names from bookings and chats
    slots.filter(s => s.doctorId === docId && s.patientName).forEach(s => {
        dynamicPatients.add(s.patientName);
    });
    chats.filter(c => c.doctorId === docId).forEach(c => {
        if (c.recipient !== `doctor${docId}` && c.recipient !== 'patient') {
            dynamicPatients.add(c.recipient);
        }
    });

    dynamicPatients.forEach(patient => {
        const thread = chats.filter(m => m.doctorId === docId && (m.recipient === patient || m.sender === 'patient'));
        let lastMsg = "Tap to chat...";
        if (thread.length > 0) {
            lastMsg = thread[thread.length - 1].text;
        }

        const activeClass = currentDocChatPatient === patient ? 'active' : '';

        const item = document.createElement('div');
        item.className = `inbox-item ${activeClass}`;
        item.onclick = () => selectDoctorChatPatient(docId, patient);
        item.innerHTML = `
            <div class="inbox-item-avatar">${patient.charAt(0)}</div>
            <div class="inbox-item-meta">
                <div class="inbox-item-name">${patient}</div>
                <div class="inbox-item-preview">${lastMsg}</div>
            </div>
        `;
        inbox.appendChild(item);
    });
}

function selectDoctorChatPatient(docId, patient) {
    currentDocChatPatient = patient;
    renderDoctorInbox(docId); // highlight selected

    const body = document.getElementById('active-doc-chat-body');
    body.innerHTML = `
        <div class="chat-messages-area" id="active-doc-chat-messages">
            <!-- Messages load dynamically -->
        </div>
        <div class="chat-input-bar">
            <input type="text" class="chat-input" id="active-doc-message-input" placeholder="Type prescription or consultant advice..." onkeydown="handleDoctorChatKeyDown(event, ${docId}, '${patient}')">
            <button class="chat-send-btn" onclick="sendDoctorMessage(${docId}, '${patient}')">
                <i class="fa-solid fa-paper-plane"></i>
            </button>
        </div>
    `;

    loadDoctorMessages(docId, patient);
}

function loadDoctorMessages(docId, patient) {
    const area = document.getElementById('active-doc-chat-messages');
    if (!area) return;
    area.innerHTML = '';

    const thread = chats.filter(m => 
        m.doctorId === docId && 
        (
            (m.sender === `doctor${docId}` && m.recipient === patient) ||
            (m.sender === 'patient' && m.recipient === `doctor${docId}`)
        )
    );

    thread.forEach(msg => {
        const bubble = document.createElement('div');
        const isDoctorSender = msg.sender === `doctor${docId}`;
        bubble.className = `chat-message ${isDoctorSender ? 'sent' : 'received'}`;
        bubble.innerText = msg.text;
        area.appendChild(bubble);
    });

    area.scrollTop = area.scrollHeight;
}

function handleDoctorChatKeyDown(event, docId, patient) {
    if (event.key === 'Enter') {
        sendDoctorMessage(docId, patient);
    }
}

function sendDoctorMessage(docId, patient) {
    const input = document.getElementById('active-doc-message-input');
    const text = input.value.trim();
    if (text === '') return;

    const newMsg = {
        id: `msg-${Date.now()}`,
        sender: `doctor${docId}`,
        recipient: patient,
        text: text,
        timestamp: Date.now(),
        doctorId: docId
    };

    chats.push(newMsg);
    saveData();

    input.value = '';
    loadDoctorMessages(docId, patient);
    renderDoctorInbox(docId);
}


// ================= CORE PAGE INITIALIZER =================

window.onload = () => {
    loadData();

    // 1. Check if on patient landing page
    if (document.getElementById('slots-grid-container')) {
        refreshPatientPageDoctorDetails(); // dynamically update fields from localStorage database
        selectDocForBooking(1); // default selection
    }

    // 2. Check if on doctor portal page
    if (document.getElementById('doctor-login-pane')) {
        const savedAuth = sessionStorage.getItem('medvibe_auth_doc');
        if (savedAuth) {
            loadDoctorWorkspace(parseInt(savedAuth));
        } else {
            // Setup default passcode entry focus
            document.getElementById('doctor-login-pane').style.display = 'flex';
        }
    }
};

// Dynamic Patient page Doctor Sync details
function refreshPatientPageDoctorDetails() {
    [1, 2].forEach(id => {
        const doc = doctors[id];
        if (!doc) return;

        // Details cards
        const nameEl = document.getElementById(`doc-name-${id}`);
        if (nameEl) nameEl.innerText = doc.name;

        const specEl = document.getElementById(`doc-specialty-${id}`);
        if (specEl) specEl.innerText = doc.specialty;

        const titleEl = document.getElementById(`doc-title-${id}`);
        if (titleEl) titleEl.innerText = doc.title || (id === 1 ? "MS, MD (Dermatology) - AIIMS Delhi" : "MD (Pediatrics) - KGMU Lucknow");

        const feeEl = document.getElementById(`doc-fee-value-${id}`);
        if (feeEl) feeEl.innerText = `₹${doc.fee}`;

        const avatarEl = document.getElementById(`doc-avatar-${id}`);
        if (avatarEl) avatarEl.src = doc.avatar;

        // Selector tabs
        const selectAvatar = document.getElementById(`select-doc-avatar-${id}`);
        if (selectAvatar) selectAvatar.src = doc.avatar;

        const selectName = document.getElementById(`select-doc-name-${id}`);
        if (selectName) selectName.innerText = doc.name;

        const selectDetails = document.getElementById(`select-doc-details-${id}`);
        if (selectDetails) selectDetails.innerText = `${doc.specialty} (₹${doc.fee})`;
    });

    // Refresh calendar title header dynamically
    const title = document.getElementById('calendar-doctor-title');
    if (title) {
        title.innerText = `${doctors[selectedDoctorId].name}'s Free Slots`;
    }
}

// Apply Card and UPI gateway config toggles
function applyPaymentSettings() {
    const tabCard = document.getElementById('btn-pay-card');
    const tabUpi = document.getElementById('btn-pay-upi');
    const paneCard = document.getElementById('pane-pay-card');
    const paneUpi = document.getElementById('pane-pay-upi');

    if (!tabCard || !tabUpi) return; // not on patient page

    const upiLabel = document.querySelector('.qr-details p:last-child');
    if (upiLabel) {
        upiLabel.innerText = `UPI ID: ${paymentSettings.upiId}`;
    }

    // Toggle custom uploaded QR image or SVG fallback
    const qrImage = document.getElementById('upi-qr-image');
    const qrFallback = document.getElementById('upi-qr-fallback');
    if (qrImage && qrFallback) {
        if (paymentSettings.qrImageBase64) {
            qrImage.src = paymentSettings.qrImageBase64;
            qrImage.style.display = 'block';
            qrFallback.style.display = 'none';
        } else {
            qrImage.src = '';
            qrImage.style.display = 'none';
            qrFallback.style.display = 'block';
        }
    }

    // Toggle Card Option
    tabCard.style.display = paymentSettings.cardEnabled ? 'block' : 'none';
    
    // Toggle UPI Option
    tabUpi.style.display = paymentSettings.upiEnabled ? 'block' : 'none';

    // Set active selector default
    if (paymentSettings.cardEnabled) {
        setPaymentMethod('card');
    } else if (paymentSettings.upiEnabled) {
        setPaymentMethod('upi');
    }
}

// Listen for localStorage changes across other open tabs
window.addEventListener('storage', (event) => {
    if (event.key === 'medvibe_slots') {
        const savedSlots = localStorage.getItem('medvibe_slots');
        if (savedSlots) {
            slots = JSON.parse(savedSlots);
            renderSlotsGrid();
            const authDoc = sessionStorage.getItem('medvibe_auth_doc');
            if (authDoc && document.getElementById('doctor-workspace-pane') && document.getElementById('doctor-workspace-pane').style.display !== 'none') {
                renderDoctorDashboard(parseInt(authDoc));
            }
        }
    }
    if (event.key === 'medvibe_doctors') {
        const savedDocs = localStorage.getItem('medvibe_doctors');
        if (savedDocs) {
            doctors = JSON.parse(savedDocs);
            if (document.getElementById('slots-grid-container')) {
                refreshPatientPageDoctorDetails();
            }
            const authDoc = sessionStorage.getItem('medvibe_auth_doc');
            if (authDoc && document.getElementById('doctor-workspace-pane') && document.getElementById('doctor-workspace-pane').style.display !== 'none') {
                loadDoctorWorkspace(parseInt(authDoc));
            }
        }
    }
    if (event.key === 'medvibe_pay_settings') {
        const savedPay = localStorage.getItem('medvibe_pay_settings');
        if (savedPay) {
            paymentSettings = JSON.parse(savedPay);
            applyPaymentSettings();
        }
    }
});
