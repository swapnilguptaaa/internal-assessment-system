import fetch from 'node-fetch';

async function test() {
  try {
    const classId = 'b233a364-7f12-42fe-bd35-1d4af1b53e8d';
    const studentId = 'b233a364-7f12-42fe-bd35-1d4af1b53e8d';

    const updates = [{
       class_id: classId,
       student_id: studentId,
       mst_1: 0,
       mst_2: 0,
       qar: "NaN",
       lqar: "NaN",
       department_name: 'test'
    }];
    const res = await fetch('http://localhost:3000/api/update-grades', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        updates: updates,
        activeClassId: classId,
        attendancePeriod: {
          totalTheoryClasses: 0,
          totalLabSessions: 0,
          from: '',
          to: ''
        }
      })
    });
    console.log(await res.text());
  } catch(e) {
    console.error(e);
  }
}
test();
