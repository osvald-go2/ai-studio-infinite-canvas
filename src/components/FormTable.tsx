import React, { useState } from 'react';

interface FormData {
  name: string;
  email: string;
  role: string;
}

const initialData: FormData[] = [
  { name: '张三', email: 'zhangsan@example.com', role: '前端工程师' },
  { name: '李四', email: 'lisi@example.com', role: '后端工程师' },
  { name: '王五', email: 'wangwu@example.com', role: '产品经理' },
];

export function FormTable() {
  const [data, setData] = useState<FormData[]>(initialData);

  const handleChange = (rowIndex: number, field: keyof FormData, value: string) => {
    setData(prev => prev.map((row, i) => i === rowIndex ? { ...row, [field]: value } : row));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('提交数据:', data);
    alert('提交成功，请查看控制台');
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 max-w-2xl mx-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-zinc-800 text-zinc-300 text-sm">
            <th className="border border-zinc-700 px-4 py-2 text-left">姓名</th>
            <th className="border border-zinc-700 px-4 py-2 text-left">邮箱</th>
            <th className="border border-zinc-700 px-4 py-2 text-left">角色</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="bg-zinc-900">
              <td className="border border-zinc-700 px-2 py-1">
                <input
                  type="text"
                  value={row.name}
                  onChange={e => handleChange(i, 'name', e.target.value)}
                  className="w-full bg-transparent text-zinc-100 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </td>
              <td className="border border-zinc-700 px-2 py-1">
                <input
                  type="email"
                  value={row.email}
                  onChange={e => handleChange(i, 'email', e.target.value)}
                  className="w-full bg-transparent text-zinc-100 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </td>
              <td className="border border-zinc-700 px-2 py-1">
                <input
                  type="text"
                  value={row.role}
                  onChange={e => handleChange(i, 'role', e.target.value)}
                  className="w-full bg-transparent text-zinc-100 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="submit"
        className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
      >
        提交
      </button>
    </form>
  );
}
