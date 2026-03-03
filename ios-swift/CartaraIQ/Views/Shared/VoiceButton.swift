import SwiftUI
import Speech
import AVFoundation

struct VoiceButton: View {
    let onTranscription: (String) -> Void

    @State private var isListening = false
    @State private var pulseScale: CGFloat = 1.0
    @State private var pulseOpacity: Double = 0.0

    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    @State private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    @State private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    @State private var silenceTimer: DispatchWorkItem?

    var body: some View {
        ZStack {
            // Pulsing ring
            Circle()
                .stroke(Color.primaryTeal.opacity(pulseOpacity), lineWidth: 2)
                .scaleEffect(pulseScale)
                .frame(width: 44, height: 44)
                .animation(isListening ? .easeInOut(duration: 0.8).repeatForever(autoreverses: true) : .default, value: pulseScale)

            // Button
            Button(action: { isListening ? stopListening() : requestPermissionsAndStart() }) {
                ZStack {
                    Circle()
                        .fill(isListening ? Color.primaryTeal : Color.primaryTeal.opacity(0.15))
                        .frame(width: 38, height: 38)

                    Image(systemName: isListening ? "mic.fill" : "plus")
                        .font(.system(size: isListening ? 16 : 18, weight: .semibold))
                        .foregroundColor(isListening ? .white : .primaryTeal)
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isListening)
        }
        .frame(width: 52, height: 52)
        .onChange(of: isListening) { _, listening in
            if listening {
                withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                    pulseScale = 1.4
                    pulseOpacity = 0.5
                }
            } else {
                withAnimation(.easeOut(duration: 0.3)) {
                    pulseScale = 1.0
                    pulseOpacity = 0.0
                }
            }
        }
    }

    // MARK: - Permissions

    private func requestPermissionsAndStart() {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                guard status == .authorized else { return }
                AVAudioApplication.requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        if granted { startListening() }
                    }
                }
            }
        }
    }

    // MARK: - Start / Stop

    private func startListening() {
        guard let recognizer = speechRecognizer, recognizer.isAvailable else { return }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }

        do {
            try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            return
        }

        isListening = true

        recognitionTask = recognizer.recognitionTask(with: request) { result, error in
            guard let result else { return }
            resetSilenceTimer(transcript: result.bestTranscription.formattedString)
            if result.isFinal {
                stopListening()
            }
        }
    }

    private func stopListening() {
        silenceTimer?.cancel()
        silenceTimer = nil
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        isListening = false

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func resetSilenceTimer(transcript: String) {
        silenceTimer?.cancel()
        let work = DispatchWorkItem {
            let text = transcript.trimmingCharacters(in: .whitespaces)
            if !text.isEmpty {
                DispatchQueue.main.async {
                    onTranscription(text)
                }
            }
            stopListening()
        }
        silenceTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: work)
    }
}
