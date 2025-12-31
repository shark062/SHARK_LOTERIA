
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class VoiceHandler {
  /**
   * Transcrição de áudio (Speech-to-Text)
   */
  async transcribe(audioBuffer: Buffer, format: string = 'webm'): Promise<string> {
    try {
      const file = new File([audioBuffer], `audio.${format}`, { type: `audio/${format}` });
      
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'pt'
      });

      return transcription.text;
    } catch (error) {
      console.error('STT Error:', error);
      throw new Error('Falha na transcrição de áudio');
    }
  }

  /**
   * Síntese de voz (Text-to-Speech)
   */
  async synthesize(text: string, voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova'): Promise<Buffer> {
    try {
      const mp3 = await openai.audio.speech.create({
        model: 'tts-1',
        voice,
        input: text,
        speed: 1.0
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      return buffer;
    } catch (error) {
      console.error('TTS Error:', error);
      throw new Error('Falha na síntese de voz');
    }
  }
}

export const voiceHandler = new VoiceHandler();
