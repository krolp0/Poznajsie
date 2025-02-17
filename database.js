import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Tworzymy klienta Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function loadQuizRow(token) {
  try {
    const { data, error } = await supabase
      .from('quizzes')
      .select('session_data, partner1_answers, partner2_answers')
      .eq('token', token)
      .single();
    if (error) {
      console.error("Błąd loadQuizRow:", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("Błąd loadQuizRow:", err);
    return null;
  }
}

export async function upsertQuizRow(token, sessionData, partner1Answers, partner2Answers) {
  const finalSessionData = sessionData || {};
  const finalPartner1 = partner1Answers || {};
  const finalPartner2 = partner2Answers || {};
  try {
    const { data, error } = await supabase
      .from('quizzes')
      .upsert(
        {
          token,
          session_data: finalSessionData,
          partner1_answers: finalPartner1,
          partner2_answers: finalPartner2
        },
        { onConflict: 'token' }
      );
    if (error) {
      console.error("Błąd przy upsertQuizRow:", error);
    } else {
      console.log("Wiersz zapisany:", data);
    }
  } catch (err) {
    console.error("Błąd upsertQuizRow:", err);
  }
}
