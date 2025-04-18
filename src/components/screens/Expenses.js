import React from 'react';
import { Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Header from '../common/Header';
import { expenses } from '../../data/mockData';

const Expenses = () => {
  const { navigateTo } = useAppContext();
  
  // Calculate budget summary
  const totalBudget = 850.00;
  const spentSoFar = 560.00;
  const remaining = totalBudget - spentSoFar;
  const percentSpent = (spentSoFar / totalBudget) * 100;
  
  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Group Expenses" 
        type="screen" 
        showBack={true} 
        showMenu={false} 
        showNotifications={false} 
        backScreen="eventDetails"
      />
      
      <div className="p-4 flex-1 overflow-y-auto">
        <BudgetSummary 
          totalBudget={totalBudget}
          spentSoFar={spentSoFar}
          remaining={remaining}
          percentSpent={percentSpent}
        />
        
        <div className="flex justify-between mb-4">
          <h3 className="font-medium">Recent Expenses</h3>
          <button className="text-purple-600 text-sm font-medium flex items-center">
            <Plus size={16} className="mr-1" />
            Add Expense
          </button>
        </div>
        
        <div className="flex flex-col space-y-3">
          {expenses.map((expense) => (
            <ExpenseCard key={expense.id} expense={expense} />
          ))}
        </div>
      </div>
    </div>
  );
};

const BudgetSummary = ({ totalBudget, spentSoFar, remaining, percentSpent }) => (
  <div className="bg-white rounded-lg shadow p-4 mb-4">
    <h3 className="font-medium mb-2">Festival Summary</h3>
    <div className="flex justify-between mb-1">
      <span>Total Budget</span>
      <span className="font-medium">${totalBudget.toFixed(2)}</span>
    </div>
    <div className="flex justify-between mb-1">
      <span>Spent So Far</span>
      <span className="font-medium">${spentSoFar.toFixed(2)}</span>
    </div>
    <div className="flex justify-between">
      <span>Remaining</span>
      <span className="font-medium text-green-600">${remaining.toFixed(2)}</span>
    </div>
    
    <div className="mt-3 w-full bg-gray-200 rounded-full h-2.5">
      <div 
        className="bg-purple-600 h-2.5 rounded-full" 
        style={{ width: `${percentSpent}%` }}
      ></div>
    </div>
  </div>
);

const ExpenseCard = ({ expense }) => {
  // Determine status style
  const statusStyle = {
    settled: "text-green-600",
    pending: "text-orange-600"
  };
  
  const statusText = {
    settled: "Settled",
    pending: `${expense.pendingCount} pending`
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between mb-2">
        <div>
          <h4 className="font-medium">{expense.title}</h4>
          <p className="text-sm text-gray-500">Added by {expense.addedBy}</p>
        </div>
        <div className="text-right">
          <div className="font-medium">${expense.amount.toFixed(2)}</div>
          <div className="text-sm text-gray-500">{expense.date}</div>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <div className="flex space-x-1">
          <div className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded">
            {expense.splitType === 'equally' ? 'Split equally' : 'Custom split'}
          </div>
          <div className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
            ${expense.amountPerPerson.toFixed(2)} each
          </div>
        </div>
        <div className={statusStyle[expense.status]}>
          {statusText[expense.status]}
        </div>
      </div>
    </div>
  );
};

export default Expenses;