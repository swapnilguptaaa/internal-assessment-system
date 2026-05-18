import { supabase } from '../lib/supabase';

export const addSubject = async (subjectData: { 
  subject_name: string; 
  subject_code: string; 
  semester: number; 
  department_name: string; 
}) => {
  const { data, error } = await supabase
    .from('subjects')
    .insert({
      subject_name: subjectData.subject_name,
      subject_code: subjectData.subject_code,
      semester: subjectData.semester,
      department_name: subjectData.department_name
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};
