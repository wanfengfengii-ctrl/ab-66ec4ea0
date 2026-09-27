// 默认演示样例：6 块玻璃片、10 条候选铅条。
// 录入顺序经过特意安排，用于检验“序号序列字典序最小”的择优次序。
export const SAMPLE_PIECES = [
  { id: '1', lo: 2, hi: 4 },
  { id: '2', lo: 1, hi: 3 },
  { id: '3', lo: 1, hi: 3 },
  { id: '4', lo: 2, hi: 3 },
  { id: '5', lo: 1, hi: 2 },
  { id: '6', lo: 1, hi: 2 },
];

export const SAMPLE_BARS = [
  { index: 1, u: '1', v: '2', grade: 3, cost: 4 },
  { index: 2, u: '2', v: '3', grade: 3, cost: 5 },
  { index: 3, u: '1', v: '4', grade: 3, cost: 2 },
  { index: 4, u: '2', v: '4', grade: 3, cost: 3 },
  { index: 5, u: '3', v: '5', grade: 3, cost: 4 },
  { index: 6, u: '4', v: '5', grade: 3, cost: 6 },
  { index: 7, u: '5', v: '6', grade: 3, cost: 3 },
  { index: 8, u: '4', v: '6', grade: 3, cost: 4 },
  { index: 9, u: '1', v: '6', grade: 2, cost: 1 },
  { index: 10, u: '2', v: '6', grade: 2, cost: 3 },
];
