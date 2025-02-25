import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Tworzymy klienta Supabase
let supabase;

try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("Klient Supabase zainicjalizowany");
} catch (err) {
  console.error("Błąd inicjalizacji klienta Supabase:", err);
}

export async function loadQuizRow(token) {
  if (!token) {
    console.error("Błąd loadQuizRow: Brak tokenu");
    return null;
  }
  
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
  if (!token) {
    console.error("Błąd upsertQuizRow: Brak tokenu");
    throw new Error("Brak tokenu");
  }
  
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
      throw error;
    } else {
      console.log("Wiersz zapisany:", token);
      return data;
    }
  } catch (err) {
    console.error("Błąd upsertQuizRow:", err);
    throw err;
  }
}
